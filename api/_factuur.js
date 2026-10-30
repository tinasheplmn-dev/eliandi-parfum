/* ═══════════════════════════════════════════════════════════════
   ELIANDI — facturen (geen dependencies)

   Elke betaalde bestelling krijgt een oplopend factuurnummer en een
   PDF, opgebouwd naar het voorbeeld van de oude webshop: adressen,
   kenmerken, regels met btw-tarief, btw-detail en totalen. De PDF
   gaat als bijlage mee in de bevestigingsmail en is in het dashboard
   te downloaden.

   Bedrijfsgegevens (naam, adres, KvK, btw-nummer, factuurreeks) staan
   in 'cms:bedrijf' en zijn in het dashboard aan te passen.
   ═══════════════════════════════════════════════════════════════ */
const { store } = require('./_lib');

const BEDRIJF_STANDAARD = {
  naam: 'Eliandi Parfum',
  straat: 'Vughterstraat 70',
  postcode: '5211 GK',
  plaats: "'s-Hertogenbosch",
  land: 'Nederland',
  tel: '06-87080256',
  email: 'info@eliandiparfum.com',
  kvk: '90391896',
  btwNummer: '',
  iban: '',
  btwPct: 21,
  factuurPrefix: 'IN',
  factuurStart: 1000,      // eerste nummer van deze reeks
  gratisVanaf: 7500,       // gratis verzending vanaf dit bedrag (centen); 0 = nooit
  olie: true,              // parfumolie aanbieden bij elke geur met een prijs
  olie6: 995,              // parfumolie 6 ml (centen)
  olie13: 1495,            // parfumolie 13 ml (centen)
};

async function getBedrijf() {
  return { ...BEDRIJF_STANDAARD, ...(await store.getJson('cms:bedrijf', {})) };
}
async function saveBedrijf(b) { await store.setJson('cms:bedrijf', b); }

/* ── nummering ── */
async function volgendNummer(bedrijf) {
  const n = await store.incr('factuur:teller');
  const nr = (parseInt(bedrijf.factuurStart, 10) || 1) + n - 1;
  return `${bedrijf.factuurPrefix || 'IN'}${String(nr).padStart(6, '0')}`;
}
/* creditnota's hebben een eigen doorlopende reeks: CN000001, CN000002, … */
async function volgendCreditNummer() {
  return 'CN' + String(await store.incr('creditnota:teller')).padStart(6, '0');
}
/* hoeveel facturen er al zijn uitgegeven (het startnummer mag daarna niet meer omlaag) */
async function aantalFacturen() { return Number(await store.get('factuur:teller')) || 0; }

/* ── rekenwerk: prijzen zijn inclusief btw ── */
const excl = (cents, pct) => Math.round(cents / (1 + pct / 100));
const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');
const datum = ts => new Date(ts).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Amsterdam' });

/* het logo van Eliandi (goud op zwart), als JPEG rechtstreeks in de PDF */
let LOGO = null;
function logo() {
  if (LOGO === null) {
    try { LOGO = require('fs').readFileSync(require('path').join(__dirname, '_logo-factuur.jpg')); } catch (e) { LOGO = false; }
  }
  return LOGO;
}
/* breedte en hoogte uit de JPEG-kop (SOF-marker) */
function jpegMaat(b) {
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1], len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

/* ── een minimale PDF-schrijver ──
   Helvetica (WinAnsi), tekst, lijnen, gevulde vlakken en het logo; meer
   hebben we niet nodig. Coördinaten: A4 is 595 bij 842 punten, oorsprong linksonder. */
function pdfMaken(tekenen) {
  const ops = [];
  let beeld = null;
  const latin = s => String(s).replace(/€/g, '\x80').replace(/[^\x00-\xff]/g, '?');
  const esc = s => latin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const breedte = (s, size) => latin(s).length * size * 0.52;
  const api = {
    tekst(x, y, size, s, { bold = false, kleur = '0 0 0', align = 'left' } = {}) {
      let xx = x;
      if (align === 'right') xx = x - breedte(s, size);
      if (align === 'center') xx = x - breedte(s, size) / 2;
      ops.push(`BT ${kleur} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${xx.toFixed(1)} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`);
    },
    lijn(x1, y1, x2, y2, grijs = .78) { ops.push(`${grijs} G 0.6 w ${x1} ${y1} m ${x2} ${y2} l S`); },
    vlak(x, y, w, h, grijs = .94) { ops.push(`${grijs} g ${x} ${y} ${w} ${h} re f`); },
    kader(x, y, w, h, grijs = .78) { ops.push(`${grijs} G 0.6 w ${x} ${y} ${w} ${h} re S`); },
    /* logo met de bovenkant op y; valt terug op de naam in letters */
    logo(x, y, maat, kleur) {
      const b = logo(), m = b && jpegMaat(b);
      if (!m) { api.tekst(x, y - 26, 26, 'ELIANDI', { bold: true, kleur }); api.tekst(x, y - 50, 13, 'P A R F U M', { kleur }); return; }
      beeld = { data: b, ...m };
      ops.push(`q ${maat} 0 0 ${(maat * m.h / m.w).toFixed(2)} ${x} ${(y - maat * m.h / m.w).toFixed(2)} cm /Im1 Do Q`);
    },
  };
  tekenen(api);
  const inhoud = Buffer.from(ops.join('\n'), 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${beeld ? ' /XObject << /Im1 7 0 R >>' : ''} >> /Contents 6 0 R >>`,
    null, // inhoud
    ...(beeld ? [{ kop: `<< /Type /XObject /Subtype /Image /Width ${beeld.w} /Height ${beeld.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${beeld.data.length} >>`, data: beeld.data }] : []),
  ];
  const delen = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let pos = delen[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    let buf;
    if (o === null) buf = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${inhoud.length} >>\nstream\n`, 'latin1'), inhoud, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    else if (o.data) buf = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.kop}\nstream\n`, 'latin1'), o.data, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    else buf = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, 'latin1');
    delen.push(buf); pos += buf.length;
  });
  const xref = pos;
  let tabel = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach(o => { tabel += `${String(o).padStart(10, '0')} 00000 n \n`; });
  tabel += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  delen.push(Buffer.from(tabel, 'latin1'));
  return Buffer.concat(delen);
}

/* ── de factuur zelf ── */
function adresRegels(o) {
  if (o.soort === 'experience') return [o.name, o.email, o.phone].filter(Boolean);
  if (o.delivery === 'ophalen' || !o.address) return [o.name, 'Ophalen in de winkel', 'Vughterstraat 70, \'s-Hertogenbosch', o.phone];
  const [straat = '', pcPlaats = '', land = ''] = String(o.address).split(',').map(s => s.trim());
  return [o.name, straat, pcPlaats, land === 'BE' ? 'België' : 'Nederland', o.phone].filter(Boolean);
}

function factuurPdf(o, bedrijf) {
  const pct = Number(bedrijf.btwPct) || 21;
  const GOUD = '0.72 0.53 0.06';
  const regels = (o.items || []).map(i => ({ ...i, excl: excl(i.cents, pct) }));
  const korting = o.korting && o.korting.cents ? o.korting.cents : 0;
  const productenIncl = regels.reduce((t, r) => t + r.cents * r.qty, 0) - korting;
  const verzendIncl = o.shipping || 0;
  const productenExcl = excl(productenIncl, pct);
  const verzendExcl = excl(verzendIncl, pct);
  const totaalIncl = productenIncl + verzendIncl;
  const totaalExcl = productenExcl + verzendExcl;
  const btw = totaalIncl - totaalExcl;

  return pdfMaken(p => {
    /* kop */
    p.logo(40, 818, 84, GOUD);
    p.tekst(555, 790, 16, 'FACTUUR', { align: 'right', kleur: '0.35 0.35 0.35' });
    p.tekst(555, 772, 10, datum(o.factuur.datum), { align: 'right', kleur: '0.45 0.45 0.45' });
    p.tekst(555, 758, 10, '#' + o.factuur.nummer, { align: 'right', kleur: '0.45 0.45 0.45' });

    /* adressen */
    const exp = o.soort === 'experience';
    if (exp) {
      p.tekst(40, 712, 11, 'Klant');
      adresRegels(o).forEach((r, i) => p.tekst(40, 692 - i * 14, 10, r));
    } else {
      p.tekst(40, 712, 11, 'Afleveradres'); p.tekst(320, 712, 11, 'Factuuradres');
      adresRegels(o).forEach((r, i) => { p.tekst(40, 692 - i * 14, 10, r); p.tekst(320, 692 - i * 14, 10, r); });
    }

    /* kenmerken */
    let y = 606;
    p.vlak(40, y, 515, 18); p.kader(40, y - 18, 515, 36);
    [['Factuurnummer', 104], ['Factuurdatum', 233], [exp ? 'Boekingsreferentie' : 'Bestellingreferentie', 362], [exp ? 'Geboekt op' : 'Besteldatum', 491]].forEach(([k, x]) => p.tekst(x, y + 5, 9, k, { align: 'center' }));
    [['#' + o.factuur.nummer, 104], [datum(o.factuur.datum), 233], [o.id.toUpperCase(), 362], [datum(o.created), 491]].forEach(([k, x]) => p.tekst(x, y - 12, 8.5, k, { align: 'center' }));

    /* regels */
    y = 548;
    p.vlak(40, y, 515, 30);
    p.tekst(48, y + 17, 9, 'Product'); p.tekst(340, y + 17, 9, 'Btw-tarief');
    p.tekst(440, y + 17, 9, 'Stukprijs', { align: 'right' }); p.tekst(440, y + 6, 8, '(excl. btw)', { align: 'right' });
    p.tekst(478, y + 17, 9, 'Aantal', { align: 'center' });
    p.tekst(548, y + 17, 9, 'Totaal', { align: 'right' }); p.tekst(548, y + 6, 8, '(excl. btw)', { align: 'right' });
    p.lijn(40, y, 555, y, .6);
    let ry = y - 16;
    regels.forEach(r => {
      p.tekst(48, ry, 9, r.name.length > 52 ? r.name.slice(0, 50) + '…' : r.name);
      p.tekst(348, ry, 9, `${pct} %`);
      p.tekst(440, ry, 9, euro(r.excl), { align: 'right' });
      p.tekst(478, ry, 9, String(r.qty), { align: 'center' });
      p.tekst(548, ry, 9, euro(r.excl * r.qty), { align: 'right' });
      p.lijn(40, ry - 6, 555, ry - 6, .85);
      ry -= 20;
    });
    if (korting) {
      p.tekst(48, ry, 9, `Korting${o.korting.code ? ' (' + o.korting.code + ')' : ''}`);
      /* korting excl. btw = verschil, zodat de regels precies optellen tot het totaal */
      const regelsExcl = regels.reduce((t, r) => t + r.excl * r.qty, 0);
      p.tekst(548, ry, 9, '-' + euro(regelsExcl - productenExcl), { align: 'right' });
      p.lijn(40, ry - 6, 555, ry - 6, .85);
      ry -= 20;
    }

    /* btw-detail en totalen */
    const ty = ry - 16;
    p.vlak(40, ty - 2, 260, 18); p.kader(40, ty - 22, 260, 38);
    p.tekst(48, ty + 3, 9, 'Btw-detail'); p.tekst(120, ty + 3, 9, 'Btw-tarief'); p.tekst(185, ty + 3, 9, 'Basisprijs'); p.tekst(292, ty + 3, 9, 'Totaal btw', { align: 'right' });
    p.tekst(48, ty - 14, 9, exp ? 'Experience' : 'Producten'); p.tekst(120, ty - 14, 9, `${pct} %`); p.tekst(185, ty - 14, 9, euro(totaalExcl)); p.tekst(292, ty - 14, 9, euro(btw), { align: 'right' });
    p.kader(40, ty - 48, 260, 20); p.tekst(48, ty - 42, 9, 'Betaalmethode'); p.tekst(200, ty - 42, 9, o.betaalmethode || 'Mollie'); p.tekst(292, ty - 42, 9, euro(totaalIncl), { align: 'right' });
    p.kader(40, ty - 68, 260, 20); p.tekst(48, ty - 62, 9, exp ? 'Plaats' : 'Levering'); p.tekst(200, ty - 62, 9, exp ? 'In de winkel' : o.delivery === 'ophalen' ? 'Ophalen in de winkel' : 'Verzending');

    p.vlak(330, ty - 112, 225, 132, .96);
    const tot = [
      [exp ? 'Aanbetaling' : 'Totaal producten', euro(productenExcl)],
      ...(exp ? [] : [['Verzendkosten', verzendIncl ? euro(verzendExcl) : 'Gratis verzending']]),
      ['Totaal (excl. btw)', euro(totaalExcl)],
      ['Totaal btw', euro(btw)],
    ];
    tot.forEach(([k, v], i) => { p.tekst(440, ty + 3 - i * 20, 9, k, { align: 'right' }); p.tekst(548, ty + 3 - i * 20, 9, v, { align: 'right' }); });
    p.tekst(440, ty - 90, 13, 'Totaal', { align: 'right', bold: true }); p.tekst(548, ty - 90, 13, euro(totaalIncl), { align: 'right', bold: true });
    if (exp && o.rest) p.tekst(40, ty - 132, 9, `Het restant van ${euro(o.rest)} reken je af in de winkel; daarvoor krijg je daar een aparte bon.`, { kleur: '0.35 0.35 0.35' });

    voet(p, bedrijf);
  });
}

function voet(p, bedrijf) {
  p.lijn(140, 72, 455, 72, .8);
  [
    `${bedrijf.naam} - ${bedrijf.straat} - ${bedrijf.postcode} ${bedrijf.plaats} - ${bedrijf.land}`,
    'Voor meer hulp, neem contact op:',
    `Tel: ${bedrijf.tel}${bedrijf.email ? ' - ' + bedrijf.email : ''}`,
    `KVK-nummer: ${bedrijf.kvk}${bedrijf.btwNummer ? ' - Btw-nummer: ' + bedrijf.btwNummer : ''}${bedrijf.iban ? ' - IBAN: ' + bedrijf.iban : ''}`,
  ].forEach((r, i) => p.tekst(297, 60 - i * 11, 7.5, r, { align: 'center', kleur: '0.3 0.3 0.3' }));
}

/* Factuur aanmaken voor een betaalde bestelling; één keer per bestelling. */
async function maakFactuur(o) {
  const bedrijf = await getBedrijf();
  if (!o.factuur) o.factuur = { nummer: await volgendNummer(bedrijf), datum: Date.now() };
  return { factuur: o.factuur, pdf: factuurPdf(o, bedrijf), bedrijf };
}

/* Een Experience-boeking als factuurdocument: de aanbetaling is de regel,
   het restant rekent Angelo in de winkel af met zijn eigen kassabon. */
function boekingAlsFactuur(b) {
  const s = String(b.slot || '');
  return {
    soort: 'experience', id: b.id, name: b.name, email: b.email, phone: b.phone, created: b.created,
    items: [{ name: `Aanbetaling The Eliandi Experience ${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`, qty: 1, cents: b.paid || 0 }],
    shipping: 0, total: b.paid || 0, rest: Math.max(0, (b.price || 0) - (b.paid || 0)),
    factuur: b.factuur, creditnotas: b.creditnotas,
  };
}

/* bedragen van een factuur of creditnota: incl., excl. en btw */
function bedragen(cents, pct) {
  const ex = excl(cents, pct);
  return { incl: cents, excl: ex, btw: cents - ex };
}

/* Creditnota: (een deel van) een factuur terugbetaald. Eén regel die
   verwijst naar de oorspronkelijke factuur, met negatieve bedragen. */
async function maakCreditnota(doc, cents, reden) {
  const cn = { nummer: await volgendCreditNummer(), datum: Date.now(), cents, reden: reden || '' };
  doc.creditnotas = [...(doc.creditnotas || []), cn];
  return cn;
}
function creditnotaPdf(o, cn, bedrijf) {
  const pct = Number(bedrijf.btwPct) || 21;
  const GOUD = '0.72 0.53 0.06';
  const b = bedragen(cn.cents, pct);
  const min = c => '-' + euro(c);
  return pdfMaken(p => {
    p.logo(40, 818, 84, GOUD);
    p.tekst(555, 790, 16, 'CREDITNOTA', { align: 'right', kleur: '0.35 0.35 0.35' });
    p.tekst(555, 772, 10, datum(cn.datum), { align: 'right', kleur: '0.45 0.45 0.45' });
    p.tekst(555, 758, 10, '#' + cn.nummer, { align: 'right', kleur: '0.45 0.45 0.45' });

    p.tekst(40, 712, 11, 'Klant');
    adresRegels(o).forEach((r, i) => p.tekst(40, 692 - i * 14, 10, r));

    let y = 606;
    p.vlak(40, y, 515, 18); p.kader(40, y - 18, 515, 36);
    [['Creditnotanummer', 104], ['Datum', 233], ['Hoort bij factuur', 362], ['Factuurdatum', 491]].forEach(([k, x]) => p.tekst(x, y + 5, 9, k, { align: 'center' }));
    [['#' + cn.nummer, 104], [datum(cn.datum), 233], ['#' + o.factuur.nummer, 362], [datum(o.factuur.datum), 491]].forEach(([k, x]) => p.tekst(x, y - 12, 8.5, k, { align: 'center' }));

    y = 548;
    p.vlak(40, y, 515, 30);
    p.tekst(48, y + 13, 9, 'Omschrijving'); p.tekst(380, y + 13, 9, 'Btw-tarief');
    p.tekst(548, y + 17, 9, 'Bedrag', { align: 'right' }); p.tekst(548, y + 6, 8, '(excl. btw)', { align: 'right' });
    p.lijn(40, y, 555, y, .6);
    let ry = y - 16;
    p.tekst(48, ry, 9, `Terugbetaling op factuur #${o.factuur.nummer} (${o.soort === 'experience' ? 'boeking' : 'bestelling'} ${String(o.id).toUpperCase()})`);
    p.tekst(388, ry, 9, `${pct} %`); p.tekst(548, ry, 9, min(b.excl), { align: 'right' });
    p.lijn(40, ry - 6, 555, ry - 6, .85);
    if (cn.reden) { ry -= 16; p.tekst(48, ry, 8.5, 'Reden: ' + (cn.reden.length > 90 ? cn.reden.slice(0, 88) + '…' : cn.reden), { kleur: '0.35 0.35 0.35' }); }

    const ty = ry - 36;
    p.kader(40, ty - 8, 260, 20); p.tekst(48, ty - 2, 9, 'Terugbetaald via'); p.tekst(200, ty - 2, 9, 'Mollie');
    p.vlak(330, ty - 72, 225, 92, .96);
    [['Totaal (excl. btw)', min(b.excl)], [`Btw ${pct} %`, min(b.btw)]].forEach(([k, v], i) => { p.tekst(440, ty + 3 - i * 20, 9, k, { align: 'right' }); p.tekst(548, ty + 3 - i * 20, 9, v, { align: 'right' }); });
    p.tekst(440, ty - 50, 13, 'Totaal', { align: 'right', bold: true }); p.tekst(548, ty - 50, 13, min(b.incl), { align: 'right', bold: true });

    voet(p, bedrijf);
  });
}

/* Pakbon: wat er in het pakket moet, zonder prijzen, met vinkvakjes.
   De privénotitie van Angelo staat er bewust niet op. */
function pakbonPdf(o, bedrijf) {
  const GOUD = '0.72 0.53 0.06';
  return pdfMaken(p => {
    p.logo(40, 818, 84, GOUD);
    p.tekst(555, 790, 16, 'PAKBON', { align: 'right', kleur: '0.35 0.35 0.35' });
    p.tekst(555, 772, 10, 'Bestelling #' + o.id.toUpperCase(), { align: 'right', kleur: '0.45 0.45 0.45' });
    p.tekst(555, 758, 10, datum(o.created), { align: 'right', kleur: '0.45 0.45 0.45' });

    p.tekst(40, 712, 11, o.delivery === 'ophalen' ? 'Wordt opgehaald door' : 'Verzenden naar', { bold: true });
    adresRegels(o).forEach((r, i) => p.tekst(40, 692 - i * 14, 10, r));
    p.tekst(320, 712, 11, 'Afzender', { bold: true });
    [bedrijf.naam, bedrijf.straat, `${bedrijf.postcode} ${bedrijf.plaats}`, bedrijf.tel].filter(Boolean).forEach((r, i) => p.tekst(320, 692 - i * 14, 10, r));

    let y = 600;
    p.vlak(40, y, 515, 22);
    p.tekst(48, y + 7, 9.5, 'Aantal', { bold: true }); p.tekst(100, y + 7, 9.5, 'Product', { bold: true }); p.tekst(547, y + 7, 9.5, 'Ingepakt', { align: 'right', bold: true });
    y -= 6;
    (o.items || []).forEach(i => {
      y -= 22;
      p.tekst(60, y, 11, String(i.qty) + '×', { bold: true });
      p.tekst(100, y, 10.5, i.name);
      p.kader(525, y - 3, 14, 14);
      p.lijn(40, y - 9, 555, y - 9);
      if (i.kind === 'discovery' && o.perfumes && o.perfumes.length) {
        o.perfumes.forEach(n => { y -= 16; p.tekst(116, y, 9.5, '· ' + n, { kleur: '0.35 0.35 0.35' }); p.kader(525, y - 3, 11, 11); });
        y -= 6; p.lijn(40, y - 4, 555, y - 4);
      }
    });
    y -= 40;
    p.tekst(40, y, 10, 'Bedankt voor je bestelling. Vragen? Bel of app ' + (bedrijf.tel || '') + ' of mail ' + (bedrijf.email || '') + '.', { kleur: '0.35 0.35 0.35' });
    p.tekst(40, y - 16, 10, 'Past de geur toch niet bij je? Kom langs in de winkel; Angelo zoekt samen met jou de geur die wel klopt.', { kleur: '0.35 0.35 0.35' });
  });
}

module.exports = {
  getBedrijf, saveBedrijf, maakFactuur, factuurPdf, pakbonPdf, BEDRIJF_STANDAARD, excl,
  boekingAlsFactuur, bedragen, maakCreditnota, creditnotaPdf, aantalFacturen,
};

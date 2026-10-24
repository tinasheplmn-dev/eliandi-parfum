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

/* ── rekenwerk: prijzen zijn inclusief btw ── */
const excl = (cents, pct) => Math.round(cents / (1 + pct / 100));
const euro = c => '€' + (c / 100).toFixed(2).replace('.', ',');
const datum = ts => new Date(ts).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Amsterdam' });

/* ── een minimale PDF-schrijver ──
   Helvetica (WinAnsi), tekst, lijnen en gevulde vlakken; meer hebben
   we niet nodig. Coördinaten: A4 is 595 bij 842 punten, oorsprong linksonder. */
function pdfMaken(tekenen) {
  const ops = [];
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
  };
  tekenen(api);
  const inhoud = Buffer.from(ops.join('\n'), 'latin1');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>',
    null, // inhoud
  ];
  const delen = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  const offsets = [];
  let pos = delen[0].length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    let buf;
    if (o === null) buf = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n<< /Length ${inhoud.length} >>\nstream\n`, 'latin1'), inhoud, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
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
    p.tekst(40, 788, 26, 'ELIANDI', { bold: true, kleur: GOUD });
    p.tekst(40, 764, 13, 'P A R F U M', { kleur: GOUD });
    p.tekst(555, 790, 16, 'FACTUUR', { align: 'right', kleur: '0.35 0.35 0.35' });
    p.tekst(555, 772, 10, datum(o.factuur.datum), { align: 'right', kleur: '0.45 0.45 0.45' });
    p.tekst(555, 758, 10, '#' + o.factuur.nummer, { align: 'right', kleur: '0.45 0.45 0.45' });

    /* adressen */
    p.tekst(40, 712, 11, 'Afleveradres'); p.tekst(320, 712, 11, 'Factuuradres');
    adresRegels(o).forEach((r, i) => { p.tekst(40, 692 - i * 14, 10, r); p.tekst(320, 692 - i * 14, 10, r); });

    /* kenmerken */
    let y = 606;
    p.vlak(40, y, 515, 18); p.kader(40, y - 18, 515, 36);
    [['Factuurnummer', 104], ['Factuurdatum', 233], ['Bestellingreferentie', 362], ['Besteldatum', 491]].forEach(([k, x]) => p.tekst(x, y + 5, 9, k, { align: 'center' }));
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
    p.tekst(48, ty - 14, 9, 'Producten'); p.tekst(120, ty - 14, 9, `${pct} %`); p.tekst(185, ty - 14, 9, euro(totaalExcl)); p.tekst(292, ty - 14, 9, euro(btw), { align: 'right' });
    p.kader(40, ty - 48, 260, 20); p.tekst(48, ty - 42, 9, 'Betaalmethode'); p.tekst(200, ty - 42, 9, o.betaalmethode || 'Mollie'); p.tekst(292, ty - 42, 9, euro(totaalIncl), { align: 'right' });
    p.kader(40, ty - 68, 260, 20); p.tekst(48, ty - 62, 9, 'Levering'); p.tekst(200, ty - 62, 9, o.delivery === 'ophalen' ? 'Ophalen in de winkel' : 'Verzending');

    p.vlak(330, ty - 112, 225, 132, .96);
    const tot = [
      ['Totaal producten', euro(productenExcl)],
      ['Verzendkosten', verzendIncl ? euro(verzendExcl) : 'Gratis verzending'],
      ['Totaal (excl. btw)', euro(totaalExcl)],
      ['Totaal btw', euro(btw)],
    ];
    tot.forEach(([k, v], i) => { p.tekst(440, ty + 3 - i * 20, 9, k, { align: 'right' }); p.tekst(548, ty + 3 - i * 20, 9, v, { align: 'right' }); });
    p.tekst(440, ty - 90, 13, 'Totaal', { align: 'right', bold: true }); p.tekst(548, ty - 90, 13, euro(totaalIncl), { align: 'right', bold: true });

    /* voet */
    p.lijn(140, 72, 455, 72, .8);
    const voet = [
      `${bedrijf.naam} - ${bedrijf.straat} - ${bedrijf.postcode} ${bedrijf.plaats} - ${bedrijf.land}`,
      'Voor meer hulp, neem contact op:',
      `Tel: ${bedrijf.tel}${bedrijf.email ? ' - ' + bedrijf.email : ''}`,
      `KVK-nummer: ${bedrijf.kvk}${bedrijf.btwNummer ? ' - Btw-nummer: ' + bedrijf.btwNummer : ''}${bedrijf.iban ? ' - IBAN: ' + bedrijf.iban : ''}`,
    ];
    voet.forEach((r, i) => p.tekst(297, 60 - i * 11, 7.5, r, { align: 'center', kleur: '0.3 0.3 0.3' }));
  });
}

/* Factuur aanmaken voor een betaalde bestelling; één keer per bestelling. */
async function maakFactuur(o) {
  const bedrijf = await getBedrijf();
  if (!o.factuur) o.factuur = { nummer: await volgendNummer(bedrijf), datum: Date.now() };
  return { factuur: o.factuur, pdf: factuurPdf(o, bedrijf), bedrijf };
}

module.exports = { getBedrijf, saveBedrijf, maakFactuur, factuurPdf, BEDRIJF_STANDAARD, excl };

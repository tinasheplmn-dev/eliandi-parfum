/* ═══════════════════════════════════════════════════════════════
   ELIANDI — bevestigingsmails (geen dependencies)

   Verstuurd via Resend zodra RESEND_API_KEY bestaat. Zonder die
   sleutel wordt er niets verstuurd en alleen een regel gelogd; de
   site blijft dan gewoon werken.

     RESEND_API_KEY   re_...
     MAIL_FROM        Eliandi Parfum <info@eliandiparfum.com>
     MAIL_BCC         adres van Angelo, krijgt een kopie van alles

   De teksten volgen de merkstem van Eliandi: Nederlands, warm,
   rechtstreeks tegen de klant, zonder opsmuk en zonder beloftes die
   we niet waarmaken.
   ═══════════════════════════════════════════════════════════════ */
const KEY = () => process.env.RESEND_API_KEY || '';
const FROM = () => process.env.MAIL_FROM || 'Eliandi Parfum <info@eliandiparfum.com>';
const BCC = () => process.env.MAIL_BCC || '';
/* Antwoordt een klant op de bevestiging, dan moet dat in een mailbox
   landen die echt bestaat. Verstuur je vanaf een domein zonder mail,
   zet dan MAIL_REPLY_TO op het echte adres van Angelo. */
const REPLY = () => process.env.MAIL_REPLY_TO || process.env.MAIL_OWNER || '';
const enabled = () => Boolean(KEY());

const SITE = () => (process.env.SITE_URL || 'https://eliandiparfum.com').replace(/\/$/, '');
const WINKEL = 'Vughterstraat 70, 5211 GK \'s-Hertogenbosch';
const TEL = '06 87 08 02 56';

const euro = c => '€' + (Number(c || 0) / 100).toFixed(2).replace('.', ',');

/* Hoeveel personen: nieuwe records hebben 'people', oude 'variant'. */
const personen = b => Number(b.people) || (b.variant === 'duo' ? 2 : 1);
const gezelschap = b => { const n = personen(b); return n === 1 ? 'Solo' : `${n} personen`; };
const WOORD = { 2: 'twee', 3: 'drie', 4: 'vier', 5: 'vijf', 6: 'zes', 7: 'zeven', 8: 'acht' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function datum(slot) {
  const d = new Date(slot.slice(0, 10) + 'T12:00:00Z');
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/* ── De omslag om elke mail ── */
function omslag({ kop, kicker, regels, knop, naschrift }) {
  const body = regels.map(r => `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:#d8d2c6">${r}</p>`).join('');
  return `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:#0f0e0b">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(kicker)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0e0b;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#17150f;border:1px solid #2e2920">
        <tr><td style="padding:34px 34px 10px;text-align:center">
          <div style="font:600 13px/1 Georgia,serif;letter-spacing:.34em;color:#e9c767;text-transform:uppercase">Eliandi</div>
          <div style="font:400 10px/1 Helvetica,Arial,sans-serif;letter-spacing:.3em;color:#8a8275;text-transform:uppercase;margin-top:7px">Parfum</div>
        </td></tr>
        <tr><td style="padding:22px 34px 0">
          <p style="margin:0 0 6px;font:600 10px/1 Helvetica,Arial,sans-serif;letter-spacing:.24em;color:#8a8275;text-transform:uppercase">${esc(kicker)}</p>
          <h1 style="margin:0 0 20px;font:400 27px/1.25 Georgia,serif;color:#f4efe4">${esc(kop)}</h1>
          ${body}
        </td></tr>
        ${knop ? `<tr><td style="padding:10px 34px 4px">
          <a href="${esc(knop.href)}" style="display:inline-block;background:#d4a73c;color:#17150f;text-decoration:none;font:600 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;padding:15px 26px">${esc(knop.tekst)}</a>
        </td></tr>` : ''}
        <tr><td style="padding:26px 34px 34px">
          ${naschrift ? `<p style="margin:0 0 18px;font-size:13px;line-height:1.7;color:#8a8275">${naschrift}</p>` : ''}
          <hr style="border:0;border-top:1px solid #2e2920;margin:0 0 16px">
          <p style="margin:0;font-size:12px;line-height:1.8;color:#8a8275">
            Eliandi Parfum &middot; ${WINKEL}<br>
            Vragen? Bel of app Angelo op <a href="tel:+31687080256" style="color:#c9a44a;text-decoration:none">${TEL}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

/* ── Versturen ── */
async function verstuur({ to, subject, html, text, attachments, replyTo }) {
  if (!enabled()) { console.log('mail overgeslagen (geen RESEND_API_KEY):', subject, '->', to); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KEY(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM(), to: [to], subject, html, text,
        ...(BCC() ? { bcc: [BCC()] } : {}),
        ...((replyTo || REPLY()) ? { reply_to: replyTo || REPLY() } : {}),
        ...(attachments ? { attachments } : {}),
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.message || ('status ' + r.status));
    return true;
  } catch (e) {
    console.error('mail mislukt:', subject, e.message);
    return false;
  }
}

/* ── Afspraak voor in de agenda van de klant ── */
function icsBestand(b) {
  const stempel = s => s.replace(/[-:]/g, '') + '00';
  const laatste = b.slots[b.slots.length - 1];
  const [h, m] = laatste.slice(11).split(':').map(Number);
  const eind = `${laatste.slice(0, 10)}T${String(Math.floor((h * 60 + m + 30) / 60)).padStart(2, '0')}:${String((h * 60 + m + 30) % 60).padStart(2, '0')}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eliandi Parfum//NL',
    'BEGIN:VEVENT',
    'UID:eliandi-' + b.id + '@eliandiparfum.com',
    'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
    'DTSTART;TZID=Europe/Amsterdam:' + stempel(b.slots[0]),
    'DTEND;TZID=Europe/Amsterdam:' + stempel(eind),
    'SUMMARY:The Eliandi Experience',
    'LOCATION:Eliandi Parfum\\, ' + WINKEL.replace(/,/g, '\\,'),
    'DESCRIPTION:Jouw privésessie met Angelo. Vragen? Bel ' + TEL,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return { filename: 'eliandi-experience.ics', content: Buffer.from(ics).toString('base64') };
}

/* ── De mails zelf ── */
async function boekingBevestigd(b, factuur) {
  const n = personen(b);
  const samen = n > 1;
  const minuten = b.minutes || 30 * n;
  const duur = minuten === 30 ? 'een half uur' : minuten === 60 ? 'een uur' : minuten === 90 ? 'anderhalf uur' : `${minuten} minuten`;
  const rest = Math.max(0, (b.price || 0) - (b.paid || 0));
  const regels = [
    `${samen ? `Jullie komen met z'n ${WOORD[n] || n}en` : 'Je komt'} op <strong style="color:#f4efe4">${esc(datum(b.slot))} om ${esc(b.slot.slice(11))}</strong> naar ${esc(WINKEL)}. Reken op ${duur}; de winkel is op dat moment alleen voor ${samen ? 'jullie' : 'jou'}.`,
    samen
      ? 'Angelo neemt met ieder van jullie door wat je mooi vindt en waar je geur bij moet passen. Aan het eind loopt iedereen naar buiten met een eigen extrait de parfum van 50 ml.'
      : 'Angelo neemt met je door wat je mooi vindt en waar je geur bij moet passen. Aan het eind loop je naar buiten met je eigen extrait de parfum van 50 ml.',
    b.voucher
      ? `Je betaalde met cadeaubon <strong style="color:#f4efe4">${esc(b.voucher)}</strong>. Er staat niets meer open.`
      : `Je hebt <strong style="color:#f4efe4">${euro(b.paid)}</strong> aanbetaald.${rest ? ` Het restant van ${euro(rest)} voldoe je in de winkel.` : ''}`,
    b.note ? `Je gaf nog mee: <em style="color:#bdb5a5">${esc(b.note)}</em>` : '',
  ].filter(Boolean);

  return verstuur({
    to: b.email,
    subject: `Je Eliandi Experience staat vast: ${datum(b.slot)} om ${b.slot.slice(11)}`,
    html: omslag({
      kicker: samen ? `The Eliandi Experience voor ${gezelschap(b).toLowerCase()}` : 'The Eliandi Experience geboekt',
      kop: 'Tot snel.',
      regels,
      naschrift: `Komt het toch niet uit? Bel of app Angelo, dan zoeken we samen een ander moment. In de bijlage zit een afspraak die je in je eigen agenda kunt zetten${factuur ? ', en de factuur van je aanbetaling' : ''}.`,
    }),
    text: `Je Eliandi Experience staat vast op ${datum(b.slot)} om ${b.slot.slice(11)}, ${WINKEL}.\n`
      + (b.voucher ? `Betaald met cadeaubon ${b.voucher}.` : `Aanbetaald: ${euro(b.paid)}.${rest ? ` Restant in de winkel: ${euro(rest)}.` : ''}`)
      + `\nVragen? Bel of app Angelo op ${TEL}.`,
    attachments: [icsBestand(b), ...(factuur ? [factuur] : [])],
  });
}

/* Creditnota na een terugbetaling, met de PDF als bijlage. */
async function creditnotaVerstuurd(o, cn, bijlage) {
  const wat = o.soort === 'experience' ? 'je aanbetaling voor The Eliandi Experience' : `je bestelling ${String(o.id).toUpperCase()}`;
  return verstuur({
    to: o.email,
    subject: `Terugbetaling van ${euro(cn.cents)} voor ${o.soort === 'experience' ? 'je Experience' : 'je bestelling'}`,
    html: omslag({
      kicker: 'Terugbetaling',
      kop: 'Je geld komt terug.',
      regels: [
        `We hebben <strong style="color:#f4efe4">${euro(cn.cents)}</strong> terugbetaald voor ${esc(wat)}. Het staat binnen een paar werkdagen op je rekening, via dezelfde betaalmethode als waarmee je betaalde.`,
        `In de bijlage zit de creditnota (${esc(cn.nummer)}) bij factuur ${esc(o.factuur.nummer)}. Bewaar hem bij je factuur.`,
      ],
    }),
    text: `We hebben ${euro(cn.cents)} terugbetaald voor ${wat}. In de bijlage zit creditnota ${cn.nummer} bij factuur ${o.factuur.nummer}.\nVragen? Bel of app Angelo op ${TEL}.`,
    attachments: [bijlage],
  });
}

async function boekingGeannuleerd(b) {
  return verstuur({
    to: b.email,
    subject: `Je Eliandi Experience van ${datum(b.slot)} is geannuleerd`,
    html: omslag({
      kicker: 'Afspraak geannuleerd',
      kop: 'Je afspraak is uit de agenda.',
      regels: [
        `De Experience van ${esc(datum(b.slot))} om ${esc(b.slot.slice(11))} gaat niet door.`,
        b.paid ? `Je aanbetaling van ${euro(b.paid)} wordt teruggestort door Angelo. Duurt dat lang, laat het dan weten.` : '',
        'Wil je een ander moment? Kies er een op de site, of bel Angelo even.',
      ].filter(Boolean),
      knop: { href: SITE() + '/experience', tekst: 'Nieuw moment kiezen' },
    }),
    text: `Je Eliandi Experience van ${datum(b.slot)} om ${b.slot.slice(11)} is geannuleerd.`
      + (b.paid ? ` De aanbetaling van ${euro(b.paid)} wordt teruggestort.` : '')
      + `\nVragen? Bel ${TEL}.`,
  });
}

async function bestellingBetaald(o, bijlage) {
  const regels = [
    'Angelo heeft je bestelling binnen en pakt hem met zorg in.',
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #2e2920">'
      + (o.items || []).map(i => `<tr><td style="padding:11px 0;border-bottom:1px solid #2e2920;color:#d8d2c6;font-size:14px">${i.qty}&times; ${esc(i.name)}</td>`
        + `<td align="right" style="padding:11px 0;border-bottom:1px solid #2e2920;color:#d8d2c6;font-size:14px">${euro(i.cents * i.qty)}</td></tr>`).join('')
      + (o.shipping ? `<tr><td style="padding:11px 0;color:#8a8275;font-size:14px">Verzending</td><td align="right" style="padding:11px 0;color:#8a8275;font-size:14px">${euro(o.shipping)}</td></tr>` : '')
      + `<tr><td style="padding:11px 0;color:#f4efe4;font-size:15px"><strong>Totaal</strong></td><td align="right" style="padding:11px 0;color:#e9c767;font-size:15px"><strong>${euro(o.total)}</strong></td></tr></table>`,
    o.perfumes && o.perfumes.length ? `In jouw set: ${esc(o.perfumes.join(' · '))}.` : '',
    o.delivery === 'ophalen'
      ? `Je haalt hem op in de winkel, ${esc(WINKEL)}. Angelo laat weten wanneer hij klaarstaat.`
      : `Hij gaat naar ${esc(o.address || 'het adres dat je hebt opgegeven')}. Je hoort het zodra hij onderweg is.`,
    o.factuur ? `Je factuur (${esc(o.factuur.nummer)}) zit als bijlage bij deze mail.` : '',
  ].filter(Boolean);

  return verstuur({
    to: o.email,
    subject: 'Je bestelling bij Eliandi is betaald',
    html: omslag({ kicker: 'Bestelling ontvangen', kop: 'Dank je wel.', regels }),
    ...(bijlage ? { attachments: [bijlage] } : {}),
    text: `Je bestelling bij Eliandi is betaald. Totaal ${euro(o.total)}.\n`
      + (o.items || []).map(i => `${i.qty}x ${i.name}`).join('\n') + `\nVragen? Bel ${TEL}.`,
  });
}

async function bonBetaald(v, site) {
  const link = `${(site || SITE()).replace(/\/$/, '')}/cadeaubon?code=${encodeURIComponent(v.code)}`;
  return verstuur({
    to: v.buyer && v.buyer.email,
    subject: 'Je cadeaubon voor The Eliandi Experience',
    html: omslag({
      kicker: 'Cadeaubon',
      kop: 'De bon is van jou.',
      regels: [
        `Je cadeaubon voor The Eliandi Experience (${esc(gezelschap(v).toLowerCase())}) staat klaar${v.recipient ? ` voor ${esc(v.recipient)}` : ''}.`,
        `De code is <strong style="color:#e9c767;letter-spacing:.14em">${esc(v.code)}</strong>. Daarmee kiest de ontvanger zelf een moment op de site.`,
        'Via de knop hieronder open je de bon om te printen of door te sturen.',
      ],
      knop: { href: link, tekst: 'Open de cadeaubon' },
      naschrift: 'De bon blijft geldig tot hij gebruikt is. Er zit geen houdbaarheidsdatum op.',
    }),
    text: `Je cadeaubon voor The Eliandi Experience. Code: ${v.code}\nBekijk hem op ${link}\nVragen? Bel ${TEL}.`,
  });
}

/* Bericht aan de klant als Angelo de status verandert. */
async function bestellingStatus(o, status) {
  const T = {
    verzonden: {
      subject: 'Je bestelling bij Eliandi is onderweg',
      kicker: 'Onderweg', kop: 'Hij komt eraan.',
      regels: [
        `Angelo heeft je bestelling ingepakt en meegegeven aan de bezorger. Hij gaat naar ${esc(o.address || 'je adres')}.`,
        o.trackTrace ? `Volg je pakket met dit nummer: <strong style="color:#f4efe4">${esc(o.trackTrace)}</strong>` : 'Meestal is hij binnen een of twee werkdagen bij je.',
      ],
    },
    'klaar om op te halen': {
      subject: 'Je bestelling ligt klaar in de winkel',
      kicker: 'Klaar om op te halen', kop: 'Hij ligt voor je klaar.',
      regels: [
        `Je bestelling staat klaar in de winkel aan de ${esc(WINKEL)}. Kom langs wanneer het jou uitkomt tijdens de openingstijden.`,
        'Neem deze mail mee, of noem je naam aan de balie.',
      ],
    },
    geannuleerd: {
      subject: 'Je bestelling bij Eliandi is geannuleerd',
      kicker: 'Geannuleerd', kop: 'Deze bestelling gaat niet door.',
      regels: [
        'Angelo heeft je bestelling geannuleerd. Heb je al betaald, dan stort hij het bedrag terug; dat kan een paar werkdagen duren.',
        'Was dit niet de bedoeling? Bel of app Angelo, dan lost hij het met je op.',
      ],
    },
  }[status];
  if (!T) return false;
  return verstuur({
    to: o.email, subject: T.subject,
    html: omslag({ kicker: T.kicker, kop: T.kop, regels: T.regels }),
    text: T.regels.join('\n').replace(/<[^>]+>/g, '') + `\nVragen? Bel ${TEL}.`,
  });
}

/* Een dag na een niet-afgemaakte bestelling: één vriendelijke herinnering. */
async function winkelmandHerinnering(o) {
  return verstuur({
    to: o.email,
    subject: 'Je geuren staan nog klaar bij Eliandi',
    html: omslag({
      kicker: 'Nog niet afgerond', kop: 'Je was er bijna.',
      regels: [
        `Gisteren koos je ${(o.items || []).map(i => `${i.qty}× ${esc(i.name)}`).join(', ')}, maar de betaling is niet afgemaakt. Dat kan gebeuren.`,
        'Wil je ze alsnog? Ze staan nog in de shop. Twijfel je nog, kom dan gerust eerst ruiken in de winkel.',
      ],
      knop: { href: SITE() + '/shop', tekst: 'Naar de shop' },
      naschrift: 'Dit is de enige herinnering die we sturen. Geen interesse meer? Dan hoef je niets te doen.',
    }),
    text: `Je bestelling bij Eliandi is nog niet afgerond. Kijk op ${SITE()}/shop. Vragen? Bel ${TEL}.`,
  });
}

/* Korte melding aan Angelo zelf, zodat hij het ook ziet zonder dashboard. */
async function melding(onderwerp, regels) {
  const naar = process.env.MAIL_OWNER || BCC();
  if (!naar) return false;
  /* klantinvoer (naam, opmerking) mag nooit als HTML in de mail belanden;
     alleen de regelafbreking die we zelf meegeven blijft staan */
  const veilig = r => String(r).replace(/<br>/g, '\u0001').replace(/[<>"]/g, c => ({ '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/\u0001/g, '<br>');
  onderwerp = String(onderwerp).replace(/[\r\n]+/g, ' ');
  regels = regels.map(veilig);
  return verstuur({
    to: naar,
    subject: onderwerp,
    html: omslag({ kicker: 'Vanaf de website', kop: onderwerp, regels }),
    text: regels.join('\n').replace(/<[^>]+>/g, ''),
  });
}

module.exports = {
  enabled, verstuur, boekingBevestigd, boekingGeannuleerd, creditnotaVerstuurd,
  bestellingBetaald, bestellingStatus, bonBetaald, winkelmandHerinnering, melding, datum, euro, gezelschap, personen,
};

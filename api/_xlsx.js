/* Minimale .xlsx-schrijver zonder afhankelijkheden: één of meer bladen
   met tekst, getallen en datums, kopregel vet en vastgezet, kolom-
   breedtes op maat. Een .xlsx is een zip met XML-bestanden; we pakken
   ze ongecomprimeerd in ("stored"), wat Excel, Numbers en Google
   Sheets gewoon openen.
   gebruik: maakXlsx([{ naam: 'Bestellingen', kolommen: ['Datum', ...], rijen: [[...], ...] }]) -> Buffer */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(bestanden) {
  const delen = [], centraal = []; let offset = 0;
  for (const [naam, inhoud] of bestanden) {
    const n = Buffer.from(naam), d = Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud), crc = crc32(d);
    const kop = Buffer.alloc(30); kop.writeUInt32LE(0x04034b50, 0); kop.writeUInt16LE(20, 4); kop.writeUInt16LE(0x0800, 6); kop.writeUInt16LE(0, 8);
    kop.writeUInt32LE(0, 10); kop.writeUInt32LE(crc, 14); kop.writeUInt32LE(d.length, 18); kop.writeUInt32LE(d.length, 22); kop.writeUInt16LE(n.length, 26); kop.writeUInt16LE(0, 28);
    delen.push(kop, n, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt32LE(0, 12); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42); centraal.push(c, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centraal);
  const eind = Buffer.alloc(22); eind.writeUInt32LE(0x06054b50, 0); eind.writeUInt16LE(bestanden.length, 8); eind.writeUInt16LE(bestanden.length, 10);
  eind.writeUInt32LE(cd.length, 12); eind.writeUInt32LE(offset, 16);
  return Buffer.concat([...delen, cd, eind]);
}

const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const kolom = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
/* Excel telt dagen vanaf 30-12-1899 */
/* klok- en kalendertijd van Amsterdam, ook als de server op UTC draait */
function excelDatum(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) / 86400000 + 25569;
}

function blad(b) {
  const breedte = b.kolommen.map((k, i) => Math.min(60, Math.max(String(k).length, ...b.rijen.map(r => (r[i] instanceof Date ? 16 : String(r[i] == null ? '' : r[i]).length))) + 2));
  const cel = (v, ref, stijl) => {
    if (v == null || v === '') return '';
    if (v instanceof Date) return `<c r="${ref}" s="2"><v>${excelDatum(v)}</v></c>`;
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${stijl ? ` s="${stijl}"` : ''}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${stijl ? ` s="${stijl}"` : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const geld = new Set(b.geld || []);
  const rijen = [`<row r="1">${b.kolommen.map((k, i) => cel(k, kolom(i) + 1, 1)).join('')}</row>`]
    .concat(b.rijen.map((r, j) => `<row r="${j + 2}">${r.map((v, i) => cel(v, kolom(i) + (j + 2), geld.has(i) && typeof v === 'number' ? 3 : 0)).join('')}</row>`));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${breedte.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rijen.join('')}</sheetData>${b.rijen.length ? `<autoFilter ref="A1:${kolom(b.kolommen.length - 1)}${b.rijen.length + 1}"/>` : ''}</worksheet>`;
}

function maakXlsx(bladen) {
  const namen = bladen.map((b, i) => xml(String(b.naam || 'Blad' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${bladen.map((b, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${namen.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${bladen.map((b, i) => b.rijen.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${namen[i]}'!$A$1:$${kolom(b.kolommen.length - 1)}$${b.rijen.length + 1}</definedName></definedNames>` : '').slice(0, 1).join('')}</workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${bladen.map((b, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${bladen.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd-mm-yyyy hh:mm"/><numFmt numFmtId="165" formatCode="&quot;€&quot; #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3E9CF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`],
    ...bladen.map((b, i) => [`xl/worksheets/sheet${i + 1}.xml`, blad(b)]),
  ]);
}
module.exports = { maakXlsx };

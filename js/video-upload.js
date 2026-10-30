/* ═══════════════════════════════════════════════════════════════
   ELIANDI — video uploaden, vanuit het dashboard en de bewerkmodus

   Een video is te groot voor de database. Hij gaat daarom rechtstreeks
   van de browser naar Vercel Blob; de server geeft alleen een sleutel
   uit die een uur geldig is, voor één bestand en alleen voor video.
   Van een beeld uit het begin maken we een stilstaande voorvertoning
   (poster), zodat de pagina snel iets laat zien en Google een plaatje
   bij de video heeft.

   Gebruik: EliandiVideo.upload(bestand, api, procent => …)
   → { url, poster }   (api is de functie die /api/admin aanroept)
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
  const MAX = 200 * 1024 * 1024;

  let lib = null;
  const laad = () => lib || (lib = new Promise((ok, fout) => {
    if (window.EliandiBlob) return ok(window.EliandiBlob);
    const s = document.createElement('script');
    s.src = '/js/vendor/blob-upload.js';
    s.onload = () => ok(window.EliandiBlob);
    s.onerror = () => { lib = null; fout(new Error('Uploaden kon niet starten. Controleer je internetverbinding.')); };
    document.head.append(s);
  }));

  /* stilstaand beeld van een halve seconde in; lukt het niet (bijvoorbeeld
     een iPhone-video in HEVC op een Windows-pc), dan gaat het zonder */
  function poster(file) {
    return new Promise(resolve => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      let klaar = false;
      const stop = r => { if (klaar) return; klaar = true; URL.revokeObjectURL(url); resolve(r); };
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 2) / 4); };
      v.onseeked = () => {
        try {
          const s = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement('canvas');
          c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
          if (!c.width) return stop(null);
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          let q = 0.82, out = c.toDataURL('image/jpeg', q);
          while (out.length > 900000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
          stop(out);
        } catch (e) { stop(null); }
      };
      v.onerror = () => stop(null);
      setTimeout(() => stop(null), 15000);
      v.src = url;
    });
  }

  async function upload(file, api, voortgang) {
    if (!file) throw new Error('Kies eerst een video.');
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1];
    const type = Object.values(TYPES).includes(file.type) ? file.type : TYPES[String(ext).toLowerCase()];
    if (!type) throw new Error('Kies een video in MP4, MOV of WebM.');
    if (file.size > MAX) throw new Error('Deze video is groter dan 200 MB. Kort hem in of exporteer hem in een lagere kwaliteit.');
    /* de voorvertoning maken we tijdens het uploaden, niet ervoor: anders
       staat de teller tot een kwartier lang stil op 0% */
    const beeldKlaar = poster(file);
    const [B, { token, pathname }] = await Promise.all([laad(), api({ action: 'videoToken', type, size: file.size })]);
    if (voortgang) voortgang(0);
    const r = await B.put(pathname, file, {
      access: 'public', token, contentType: type,
      multipart: file.size > 8 * 1024 * 1024,
      onUploadProgress: p => { if (voortgang) voortgang(Math.min(99, Math.round(p.percentage))); },
    });
    if (voortgang) voortgang(100);
    const beeld = await beeldKlaar;
    let posterUrl = '';
    if (beeld) { try { posterUrl = (await api({ action: 'mediaUpload', dataUrl: beeld })).url; } catch (e) { /* zonder poster */ } }
    /* lukt zelfs een stilstaand beeld niet, dan kan deze browser de video
       niet afspelen; meestal is hij dan in HEVC opgenomen */
    const waarschuwing = beeld ? '' : 'De video staat erop, maar deze browser kan hem niet afspelen. Meestal komt dat doordat hij is opgenomen als "video met hoge efficiëntie" (HEVC). Kijk op de site of hij speelt. Speelt hij niet, zet dan in de camera-instellingen van je telefoon "video\'s met hoge efficiëntie" uit, of bewaar de video als MP4, en upload hem opnieuw.';
    return { url: r.url, poster: posterUrl, waarschuwing };
  }

  window.EliandiVideo = { upload, accept: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm' };
})();

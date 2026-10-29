/* ═══════════════════════════════════════════════════════════════
   ELIANDI — door Angelo aangepaste teksten en beelden, plus de
   bewerkmodus (site openen met ?bewerken na inloggen in /beheer).

   Elke tekst krijgt een sleutel op basis van de oorspronkelijke
   inhoud. Wordt de originele tekst later in de code aangepast, dan
   valt een oude wijziging vanzelf weg in plaats van op de verkeerde
   plek te belanden.
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const PAGE = document.body.dataset.page || 'index';
  const TEXT_SEL = 'h1,h2,h3,h4,p,li,figcaption,dt,dd,th,td,.btn,.cms-t';
  const OK_CHILD = /^(EM|I|B|STRONG|BR|SPAN)$/;
  const CACHE = 'eliandi_cms_' + PAGE;

  const hash = s => {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const norm = html => html.replace(/\s+/g, ' ').trim();

  function editableTexts() {
    return [...document.querySelectorAll(`main :is(${TEXT_SEL}), footer :is(${TEXT_SEL})`)].filter(el =>
      !el.closest('[data-cms-skip], form, .qscreen:not(#screenIntro)') &&
      el.textContent.trim() &&
      [...el.children].every(c => OK_CHILD.test(c.tagName) && !c.children.length) &&
      !el.querySelector(TEXT_SEL));
  }
  function editableImages() {
    const seen = {};
    return [...document.querySelectorAll('main img')].filter(img => !img.closest('[data-cms-skip]')).map(img => {
      const src = img.dataset.cmsOrig || img.getAttribute('src');
      seen[src] = (seen[src] || 0) + 1;
      return { img, key: 'i' + hash(src + '|' + seen[src]), src };
    });
  }

  const texts = editableTexts().map(el => {
    const orig = norm(el.innerHTML);
    return { el, orig, key: 't' + hash(orig) };
  });
  const images = editableImages();
  images.forEach(i => { i.img.dataset.cmsOrig = i.src; });

  /* Een foto die Angelo door een video heeft vervangen. De video neemt de
     plek en vorm van de foto over; hij speelt zonder geluid in een lus, en
     alleen als hij in beeld is (scheelt data). Wie minder beweging wil
     krijgt een stilstaand beeld met knoppen. */
  const rustig = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function zetVideo(i, v) {
    if (!v) {
      if (i.video) {
        i.video.replaceWith(i.img); i.video = null;
        if (document.documentElement.classList.contains('cms-editing')) koppel(i);
      }
      return;
    }
    if (i.video && i.video.dataset.url === v.url) return;
    const cs = getComputedStyle(i.img);
    const el = document.createElement('video');
    el.className = i.img.className + ' cms-video';
    /* data-attributen meenemen, zodat scripts de video vinden zoals de foto */
    Object.entries(i.img.dataset).forEach(([k, w]) => { if (!/^cms/.test(k)) el.dataset[k] = w; });
    el.dataset.url = v.url;
    el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'metadata';
    el.setAttribute('muted', ''); el.setAttribute('playsinline', '');
    el.setAttribute('aria-label', i.img.alt || 'Video');
    if (v.poster) el.poster = v.poster;
    const st = el.style;
    st.objectFit = cs.objectFit === 'fill' ? 'cover' : cs.objectFit;
    st.objectPosition = cs.objectPosition; st.filter = cs.filter; st.borderRadius = cs.borderRadius;
    if (cs.position === 'absolute' || cs.position === 'fixed') {
      st.position = cs.position; st.inset = '0'; st.width = '100%'; st.height = '100%';
    } else {
      st.display = 'block'; st.width = '100%';
      st.aspectRatio = cs.aspectRatio && cs.aspectRatio !== 'auto' ? cs.aspectRatio
        : (i.img.naturalWidth ? `${i.img.naturalWidth} / ${i.img.naturalHeight}` : '4 / 5');
    }
    el.src = v.url;
    if (rustig) el.controls = true;
    else if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.2 }).observe(el);
    }
    (i.video || i.img).replaceWith(el);
    i.video = el;
    if (document.documentElement.classList.contains('cms-editing')) koppel(i);
  }

  function apply(c) {
    if (!c) return;
    texts.forEach(t => { if (c.texts && c.texts[t.key]) t.el.innerHTML = c.texts[t.key]; });
    images.forEach(i => {
      const v = c.images && c.images[i.key];
      if (v) { i.img.src = v; i.img.removeAttribute('srcset'); }
      const vid = c.videos && c.videos[i.key];
      if (vid || i.video) {
        /* pas vervangen als de foto zijn maten kent */
        const cs = getComputedStyle(i.img);
        const maatBekend = i.img.complete || cs.position === 'absolute' || (cs.aspectRatio && cs.aspectRatio !== 'auto');
        if (vid && !maatBekend && !i.video) i.img.addEventListener('load', () => zetVideo(i, vid), { once: true });
        else zetVideo(i, vid || null);
      }
    });
  }

  try { apply(JSON.parse(localStorage.getItem(CACHE) || 'null')); } catch (e) { /* privémodus */ }
  fetch('/api/content?page=' + PAGE, { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(c => {
    if (!c) return;
    apply(c);
    try { localStorage.setItem(CACHE, JSON.stringify(c)); } catch (e) { /* privémodus */ }
  }).catch(() => {});

  /* ── Bewerkmodus ── */
  const token = (() => { try { return localStorage.getItem('eliandi_admin_token'); } catch (e) { return null; } })();
  if (!/[?&]bewerken\b/.test(location.search) || !token) return;

  const changes = { texts: {}, images: {}, videos: {} };
  const aantal = () => Object.keys(changes.texts).length + Object.keys(changes.images).length + Object.keys(changes.videos).length;
  /* de uploadhulp voor video's laden we alleen in de bewerkmodus */
  const vu = document.createElement('script');
  vu.src = '/js/video-upload.js';
  document.head.append(vu);
  document.documentElement.classList.add('cms-editing');
  document.getElementById('intro')?.remove();
  document.querySelectorAll('[data-reveal]').forEach(e => e.classList.add('in-view'));

  const style = document.createElement('style');
  style.textContent = `
    .cms-editing [data-cms-text]{outline:1px dashed rgba(212,167,60,.35);outline-offset:4px;cursor:text;transition:outline-color .2s}
    .cms-editing [data-cms-text]:hover,.cms-editing [data-cms-text]:focus{outline:1px solid #e9c767;background:rgba(212,167,60,.06)}
    .cms-editing [data-cms-img]{outline:2px dashed rgba(212,167,60,.5);outline-offset:-2px;cursor:pointer}
    .cms-editing [data-cms-img]:hover{outline-color:#e9c767;filter:brightness(1.08)}
    .cms-menu{position:fixed;z-index:10000;display:flex;flex-direction:column;min-width:210px;background:#17150f;border:1px solid #d4a73c;box-shadow:0 18px 50px rgba(0,0,0,.6);font:500 13px Montserrat,sans-serif}
    .cms-menu button{all:unset;cursor:pointer;padding:12px 16px;color:#f2ecdf;border-bottom:1px solid rgba(212,167,60,.18)}
    .cms-menu button:last-child{border-bottom:0}.cms-menu button:hover,.cms-menu button:focus{background:rgba(212,167,60,.12);color:#e9c767}
    .cms-laden{position:fixed;inset:0;z-index:10001;display:grid;place-items:center;background:rgba(10,10,10,.72);color:#f2ecdf;font:500 15px Montserrat,sans-serif;text-align:center}
    .cms-laden b{display:block;margin-top:8px;color:#e9c767;font-size:28px;font-variant-numeric:tabular-nums}
    .cms-editing .cms-dirty{outline-color:#4fc38a!important}
    .cms-bar{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9999;display:flex;align-items:center;gap:14px;
      background:#17150f;border:1px solid #d4a73c;padding:12px 14px 12px 20px;box-shadow:0 18px 50px rgba(0,0,0,.6);font:500 13px Montserrat,sans-serif;color:#f2ecdf;max-width:calc(100vw - 24px);flex-wrap:wrap}
    .cms-bar b{color:#e9c767}.cms-bar button{font:600 11px Montserrat,sans-serif;letter-spacing:.14em;text-transform:uppercase;padding:11px 16px;cursor:pointer;border:1px solid #d4a73c}
    .cms-save{background:linear-gradient(105deg,#b8860b,#e9c767);color:#1a1a1a}.cms-quit,.cms-undo{background:none;color:#e9c767}
    .cms-undo{display:none}.cms-undo.on{display:inline-block}
    .cursor-dot,.cursor-ring{display:none!important}`;
  document.head.append(style);

  texts.forEach(t => {
    t.el.dataset.cmsText = '';
    t.el.contentEditable = 'true';
    t.el.spellcheck = true;
    t.el.addEventListener('input', () => { changes.texts[t.key] = t.el.innerHTML; t.el.classList.add('cms-dirty'); update(); });
    t.el.addEventListener('focus', () => { active = t; undo.classList.add('on'); });
  });
  document.addEventListener('click', e => { if (e.target.closest('a')) e.preventDefault(); }, true);

  function koppel(i) {
    const el = i.video || i.img;
    if (el.dataset.cmsImg != null) return;
    el.dataset.cmsImg = '';
    el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); menu(i, e); });
  }
  images.forEach(koppel);

  /* klik op een foto of video: kiezen wat er moet gebeuren */
  function menu(i, e) {
    document.querySelector('.cms-menu')?.remove();
    const m = document.createElement('div');
    m.className = 'cms-menu';
    const knop = (tekst, doe) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = tekst; b.onclick = () => { m.remove(); doe(); }; m.append(b); };
    knop('Andere foto kiezen', () => pickImage(i));
    knop(i.video ? 'Andere video kiezen' : 'Video plaatsen', () => pickVideo(i));
    if (i.video) knop('Video weghalen, foto terug', () => {
      zetVideo(i, null); changes.videos[i.key] = null; i.img.classList.add('cms-dirty'); update();
    });
    knop('Annuleren', () => {});
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(e.clientX, innerWidth - r.width - 8)) + 'px';
    m.style.top = Math.max(8, Math.min(e.clientY, innerHeight - r.height - 8)) + 'px';
    m.querySelector('button').focus();
    setTimeout(() => document.addEventListener('click', function weg(x) { if (!m.contains(x.target)) { m.remove(); document.removeEventListener('click', weg, true); } }, true), 0);
  }

  function pickVideo(i) {
    if (!window.EliandiVideo) return alert('Even geduld, de uploadhulp wordt nog geladen. Probeer het zo opnieuw.');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = EliandiVideo.accept;
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const laden = document.createElement('div');
      laden.className = 'cms-laden';
      laden.innerHTML = 'Video uploaden, laat dit venster open<b>0%</b>';
      document.body.append(laden);
      try {
        const v = await EliandiVideo.upload(file, api, pct => { laden.querySelector('b').textContent = pct + '%'; });
        zetVideo(i, v);
        i.video.classList.add('cms-dirty');
        changes.videos[i.key] = v;
        delete changes.images[i.key];
        update();
      } catch (x) { alert(x.message); }
      laden.remove();
    };
    input.click();
  }

  const bar = document.createElement('div');
  bar.className = 'cms-bar';
  bar.innerHTML = `<span><b>Bewerkmodus</b> &middot; klik op een tekst, foto of video &middot; <span class="cms-count">geen wijzigingen</span></span>
    <button class="cms-undo" type="button">Origineel terug</button>
    <button class="cms-save" type="button">Opslaan</button>
    <button class="cms-quit" type="button">Stoppen</button>`;
  document.body.append(bar);
  const undo = bar.querySelector('.cms-undo');
  let active = null;

  function update() {
    const n = aantal();
    bar.querySelector('.cms-count').textContent = n ? `${n} wijziging${n > 1 ? 'en' : ''} niet opgeslagen` : 'geen wijzigingen';
  }
  undo.addEventListener('click', () => {
    if (!active) return;
    active.el.innerHTML = active.orig;
    changes.texts[active.key] = null;
    active.el.classList.add('cms-dirty');
    update();
  });

  async function api(body) {
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Opslaan mislukt');
    return d;
  }

  function pickImage(i) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const dataUrl = await shrink(file);
        const { url } = await api({ action: 'mediaUpload', dataUrl });
        if (i.video) { zetVideo(i, null); changes.videos[i.key] = null; }
        i.img.src = url;
        i.img.removeAttribute('srcset');
        i.img.classList.add('cms-dirty');
        changes.images[i.key] = url;
        update();
      } catch (e) { alert(e.message); }
    };
    input.click();
  }

  /* verkleinen in de browser: max 1600 px, JPEG */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = .84, out = c.toDataURL('image/jpeg', q);
        while (out.length > 900000 && q > .4) { q -= .1; out = c.toDataURL('image/jpeg', q); }
        URL.revokeObjectURL(img.src);
        resolve(out);
      };
      img.onerror = () => reject(new Error('Dit bestand kan niet als afbeelding worden gelezen.'));
      img.src = URL.createObjectURL(file);
    });
  }

  bar.querySelector('.cms-save').addEventListener('click', async e => {
    const btn = e.currentTarget;
    btn.textContent = 'Bezig…';
    try {
      await api({ action: 'contentSave', page: PAGE, ...changes });
      changes.texts = {}; changes.images = {}; changes.videos = {};
      document.querySelectorAll('.cms-dirty').forEach(el => el.classList.remove('cms-dirty'));
      try { localStorage.removeItem(CACHE); } catch (x) { /* privémodus */ }
      bar.querySelector('.cms-count').textContent = 'opgeslagen ✓';
    } catch (x) {
      alert(x.message === 'Log opnieuw in.' ? 'Je sessie is verlopen. Log opnieuw in via /beheer.' : x.message);
    }
    btn.textContent = 'Opslaan';
  });
  bar.querySelector('.cms-quit').addEventListener('click', () => {
    const n = aantal();
    if (n && !confirm('Er zijn wijzigingen die nog niet zijn opgeslagen. Toch stoppen?')) return;
    location.href = location.pathname;
  });
  window.addEventListener('beforeunload', e => {
    if (aantal()) e.preventDefault();
  });
})();

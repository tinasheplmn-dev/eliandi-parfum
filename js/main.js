/* ═══════════════════════════════════════════════════════════
   ELIANDI PARFUM — interactie & motion
   Eén motion-concept: "de gouden essence" — deeltjes die als
   parfumdamp door de site zweven, plus trage scroll-choreografie.
   ═══════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(hover: none)').matches;

  /* ── Intro-overlay ── */
  const intro = document.getElementById('intro');
  const INTRO_MS = prefersReduced ? 0 : 2000;
  setTimeout(() => {
    intro.classList.add('is-done');
    setTimeout(() => intro.remove(), 1100);
  }, INTRO_MS);

  /* ── Gouden essence: deeltjescanvas ── */
  const canvas = document.getElementById('essence');
  if (!prefersReduced && canvas) {
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0, dpr = 1, particles = [];
    const mouse = { x: -9999, y: -9999 };

    const COUNT = () => Math.round(Math.min(W / 14, isTouch ? 46 : 110));

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function makeParticle(randomY) {
      const deep = Math.random() < .6; // diepe laag = kleiner, vager
      return {
        x: Math.random() * W,
        y: randomY ? Math.random() * H : H + 20,
        r: deep ? .6 + Math.random() * 1.3 : 1.2 + Math.random() * 2.4,
        vy: (deep ? .12 : .22) + Math.random() * .3,
        drift: .4 + Math.random() * .9,
        phase: Math.random() * Math.PI * 2,
        speed: .003 + Math.random() * .006,
        alpha: deep ? .14 + Math.random() * .22 : .25 + Math.random() * .4,
        warm: Math.random() < .35, // deel bronskleurig
      };
    }

    function seed() {
      particles = Array.from({ length: COUNT() }, () => makeParticle(true));
    }

    let scrollDim = 1;
    function tick() {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.phase += p.speed * 16;
        p.y -= p.vy;
        p.x += Math.sin(p.phase) * p.drift * .3;

        // subtiele aantrekking naar de muis (desktop)
        if (!isTouch) {
          const dx = mouse.x - p.x, dy = mouse.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 32400) { // 180px
            const f = (1 - d2 / 32400) * .18;
            p.x += dx * f * .02;
            p.y += dy * f * .02;
          }
        }

        if (p.y < -20) Object.assign(p, makeParticle(false));
        if (p.x < -30) p.x = W + 20; else if (p.x > W + 30) p.x = -20;

        const flicker = .75 + Math.sin(p.phase * 1.7) * .25;
        const a = p.alpha * flicker * scrollDim;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
        const c = p.warm ? '205,127,50' : '212,167,60';
        g.addColorStop(0, `rgba(${c},${a})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    resize();
    requestAnimationFrame(tick);

    // essence sterkst in hero & cinematic break, gedimd daartussen
    const dimZones = [document.getElementById('hero'), document.querySelector('.break')].filter(Boolean);
    const updateDim = () => {
      let strength = .35;
      for (const el of dimZones) {
        const r = el.getBoundingClientRect();
        const overlap = Math.min(r.bottom, H) - Math.max(r.top, 0);
        if (overlap > 0) strength = Math.max(strength, .35 + .65 * Math.min(1, overlap / H));
      }
      scrollDim = strength;
    };
    window.addEventListener('scroll', updateDim, { passive: true });
    updateDim();
  }

  /* ── Navigatie: solide bij scroll ── */
  const nav = document.getElementById('nav');
  const onScrollNav = () => nav.classList.toggle('is-solid', window.scrollY > 40);
  window.addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  /* ── Scrollvoortgang ── */
  const bar = document.getElementById('progressBar');
  const onProgress = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
  };
  window.addEventListener('scroll', onProgress, { passive: true });
  onProgress();

  /* ── Mobiel menu ── */
  const burger = document.getElementById('burger');
  const mobmenu = document.getElementById('mobmenu');
  const setMenu = open => {
    burger.classList.toggle('is-open', open);
    mobmenu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open);
    mobmenu.setAttribute('aria-hidden', !open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(!mobmenu.classList.contains('is-open')));
  mobmenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));

  /* ── Reveal-choreografie ── */
  const revealIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in-view'); revealIO.unobserve(e.target); }
    }
  }, { threshold: .18, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('[data-reveal]').forEach(el => revealIO.observe(el));

  /* ── Diepte-parallax (hero/break media + kicker-lagen) ── */
  if (!prefersReduced) {
    const layers = [...document.querySelectorAll('[data-depth]')];
    const imgs = [...document.querySelectorAll('[data-depth-img]')];
    let ticking = false;
    const parallax = () => {
      ticking = false;
      const vh = window.innerHeight;
      for (const el of layers) {
        const host = el.closest('section, .break') || el;
        const r = host.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        const progress = (r.top + r.height / 2 - vh / 2) / vh; // -0.5..0.5-ish
        el.style.transform = `translateY(${progress * -100 * parseFloat(el.dataset.depth)}px)`;
      }
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) continue;
        const progress = (r.top + r.height / 2 - vh / 2) / vh;
        img.style.transform = `scale(1.08) translateY(${progress * 100 * parseFloat(img.dataset.depthImg)}px)`;
      }
    };
    window.addEventListener('scroll', () => {
      if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
    }, { passive: true });
    parallax();
  }

  /* ── Het Ritueel: actieve stap ↔ foto ── */
  const steps = [...document.querySelectorAll('.step')];
  const stepImgs = [...document.querySelectorAll('[data-step-img]')];
  if (steps.length) {
    const stepIO = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const idx = e.target.dataset.step;
        steps.forEach(s => s.classList.toggle('is-active', s === e.target));
        stepImgs.forEach(im => im.classList.toggle('is-active', im.dataset.stepImg === idx));
      }
    }, { rootMargin: '-40% 0px -40% 0px' });
    steps.forEach(s => stepIO.observe(s));
    steps[0].classList.add('is-active');
  }

  /* ── Magnetische knoppen (desktop) ── */
  if (!isTouch && !prefersReduced) {
    document.querySelectorAll('[data-magnetic]').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * .18}px, ${y * .28}px)`;
      });
      el.addEventListener('pointerleave', () => {
        el.style.transition = 'transform .5s cubic-bezier(.22,1,.36,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; }, 500);
      });
    });
  }

  /* ── Custom cursor ── */
  if (!isTouch && !prefersReduced) {
    const dot = document.querySelector('.cursor-dot');
    const ring = document.querySelector('.cursor-ring');
    let rx = 0, ry = 0, tx = 0, ty = 0;
    window.addEventListener('pointermove', e => {
      tx = e.clientX; ty = e.clientY;
      dot.style.opacity = ring.style.opacity = 1;
      dot.style.transform = `translate(${tx - 2.5}px, ${ty - 2.5}px)`;
    }, { passive: true });
    (function follow() {
      rx += (tx - rx) * .13;
      ry += (ty - ry) * .13;
      ring.style.transform = `translate(${rx - 17}px, ${ry - 17}px)`;
      requestAnimationFrame(follow);
    })();
    document.querySelectorAll('a, button').forEach(el => {
      el.addEventListener('pointerenter', () => ring.classList.add('is-hover'));
      el.addEventListener('pointerleave', () => ring.classList.remove('is-hover'));
    });
  }

  /* ── Openingstijden: vandaag markeren ── */
  const today = new Date().getDay();
  const row = document.querySelector(`.hours tr[data-day="${today}"]`);
  if (row) row.classList.add('is-today');

  /* ── Jaartal ── */
  document.getElementById('year').textContent = new Date().getFullYear();
})();

/* ── het geurkompas: om de paar seconden lichten vijf andere families op ── */
(() => {
  const svg = document.getElementById('kompas');
  if (!svg) return;
  const nodes = [...svg.querySelectorAll('.kp-node')];
  const labels = [...svg.querySelectorAll('.kp-label')];
  const line = document.getElementById('kpLijn');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* sets die ook echt samen voorkomen in de collectie */
  const SETS = [[0, 1, 2, 3, 7], [5, 6, 8, 9, 10], [2, 3, 4, 9, 11], [1, 6, 7, 9, 11], [0, 2, 5, 7, 10], [3, 4, 5, 8, 9]];
  let k = 0;
  const pos = i => { const m = /translate\(([\d.]+) ([\d.]+)\)/.exec(nodes[i].getAttribute('transform')); return [+m[1], +m[2]]; };
  const show = set => {
    nodes.forEach((n, i) => n.classList.toggle('is-lit', set.includes(i)));
    labels.forEach((l, i) => l.classList.toggle('is-lit', set.includes(i)));
    const pts = set.map(pos); pts.push(pts[0]);
    line.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    if (!reduce) { line.classList.remove('is-drawing'); void line.getBoundingClientRect(); line.classList.add('is-drawing'); }
  };
  show(SETS[0]);
  if (!reduce) setInterval(() => { k = (k + 1) % SETS.length; show(SETS[k]); }, 4200);
})();

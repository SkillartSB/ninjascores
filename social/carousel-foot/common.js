/* ═══════════════════════════════════════════════════════════════════════════
   Briques partagées par index.html (le carrousel) et story.html (la story).
   Rien à modifier ici au quotidien : les données vivent dans data.js.
   ═══════════════════════════════════════════════════════════════════════════ */

const up = s => String(s).toUpperCase();
const pad2 = n => String(n).padStart(2, '0');

/* Décor de fond : lumière volumétrique, arcs de terrain, stries, sol dégradé */
function bg(c1, c2) {
  return `
  <div class="bg" style="--team:${c1};--team-2:${c2}">
    <div class="glow-top"></div>
    <div class="glow-team"></div>
    <div class="glow-team right"></div>
    <div class="arcs">
      <svg viewBox="0 0 1080 1350" preserveAspectRatio="xMidYMid slice" fill="none">
        <g stroke="rgba(255,255,255,.09)" stroke-width="1.4">
          <circle cx="540" cy="600" r="300"/><circle cx="540" cy="600" r="392"/>
          <circle cx="540" cy="600" r="486" stroke="rgba(255,255,255,.06)"/>
          <circle cx="540" cy="600" r="592" stroke="rgba(255,255,255,.04)"/>
        </g>
        <g stroke="rgba(168,85,247,.22)" stroke-width="1.4">
          <circle cx="540" cy="600" r="300" stroke-dasharray="3 22"/>
          <path d="M96 250 h190 M96 250 v104"/>
          <path d="M984 1100 h-190 M984 1100 v-104"/>
        </g>
        <g stroke="rgba(255,255,255,.07)" stroke-width="1.2">
          <path d="M-40 1010 L1120 742"/><path d="M-40 1090 L1120 822"/>
          <path d="M-40 214 L1120 -54"/>
        </g>
      </svg>
    </div>
    <div class="streaks"></div><div class="streaks b"></div>
    <div class="floor"></div>
  </div>`;
}

/* Marque + date */
function head() {
  return `
  <div class="head">
    <div class="brand">
      <div class="mark a-pop" style="--d:.05s">
        <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <rect width="200" height="200" rx="38" fill="#7c2fbe"/>
          <ellipse cx="68" cy="28" rx="8" ry="14" fill="#fff" transform="rotate(-40 68 28)"/>
          <ellipse cx="56" cy="42" rx="8" ry="13" fill="#fff" transform="rotate(15 56 42)"/>
          <circle cx="70" cy="38" r="8" fill="#fff"/>
          <circle cx="118" cy="80" r="62" fill="#fff"/>
          <path d="M56 82 Q118 70 180 82 Q180 100 118 98 Q56 100 56 82 Z" fill="#7c2fbe"/>
          <path d="M72 85 Q85 76 98 83 Q85 90 72 85 Z" fill="#fff"/>
          <path d="M110 83 Q123 75 136 82 Q123 89 110 83 Z" fill="#fff"/>
          <text x="10" y="168" font-family="Archivo, Arial Black, sans-serif" font-weight="900"
                font-size="80" fill="#fff" letter-spacing="-2">N</text>
          <text x="12" y="190" font-family="Archivo, Arial, sans-serif" font-weight="700" font-size="17" fill="#fff">LIVE</text>
          <circle cx="68" cy="185" r="3.5" fill="#d8a0ff"/><circle cx="78" cy="185" r="3.5" fill="#d8a0ff"/>
          <circle cx="88" cy="185" r="3.5" fill="#d8a0ff"/>
          <text x="96" y="190" font-family="Archivo, Arial, sans-serif" font-weight="700" font-size="17" fill="#fff">SCORES</text>
        </svg>
      </div>
      <div class="word a-rise" style="--d:.12s"><b>NINJA</b><span>SCORES</span></div>
    </div>
    <div class="date a-rise" style="--d:.18s">${up(CAROUSEL.date)}</div>
  </div>`;
}

/* Pied de page : progression du carrousel */
function foot(i, total) {
  const bars = Array.from({ length: total }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  return `
  <div class="foot">
    <div class="bars">${bars}</div>
    <div class="pagenum">${pad2(i + 1)}<s>/</s>${pad2(total)}</div>
  </div>`;
}

/* Traînée fantôme derrière un gros titre (motion-trail façon After Effects) */
function echo(txt) {
  const ghosts = [
    { tf: 'translate(-.13em,-.08em) scale(1.10)', o: .42, d: '.18s' },
    { tf: 'translate(-.29em,-.17em) scale(1.20)', o: .26, d: '.24s' },
    { tf: 'translate(-.48em,-.28em) scale(1.32)', o: .15, d: '.30s' },
  ].map(g => `<b style="--tf:${g.tf};--d:${g.d};opacity:${g.o};
      -webkit-text-stroke:1.6px rgba(168,85,247,${g.o + .18})">${up(txt)}</b>`).join('');
  return `<div class="echo">${ghosts}</div>`;
}

/* Calque des zones masquées par l'interface TikTok (aperçu uniquement) */
function safeZones() {
  return `
  <div class="safe">
    <div style="left:0;right:0;top:0;height:180px"></div>
    <div style="left:0;right:0;bottom:0;height:250px"></div>
    <div style="right:0;top:52%;bottom:16%;width:168px"></div>
    <span style="left:26px;top:190px">Zone interface TikTok</span>
  </div>`;
}

/* ── Les gros titres sont calés au pixel sur la largeur utile : quel que soit
      le texte saisi dans data.js, la ligne remplit la colonne sans déborder. */
const FIT = [];   // la page y pousse ['.selecteur', taille max, taille min]

function fitLine(el, max, min) {
  const echoEl = el.querySelector('.echo');
  if (echoEl) echoEl.style.display = 'none';
  const cs = getComputedStyle(el.parentElement);
  const avail = el.parentElement.clientWidth
    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let lo = min, hi = max;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + 'px';
    if (el.getBoundingClientRect().width / (window.__z || 1) <= avail) lo = mid; else hi = mid;
  }
  el.style.fontSize = Math.floor(lo) + 'px';
  if (echoEl) echoEl.style.display = '';
}

function fitAll() {
  FIT.forEach(([sel, max, min]) =>
    document.querySelectorAll(sel).forEach(el => fitLine(el, max, min)));
}

/* ── Montage du plan de travail + outils d'aperçu ────────────────────────── */
function mount({ slides, label, height = 1350, formats = false }) {
  document.getElementById('stage').innerHTML = slides.map((html, i) =>
    `<div class="board"><div class="tag">${label(i, slides.length)}</div>${html}</div>`).join('');

  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const STATIC = params.has('export');
  let zoom100 = false;

  function fitZoom() {
    const z = zoom100 ? 1 : Math.min(1, (window.innerWidth - 60) / 1080);
    window.__z = z;
    root.style.setProperty('--z', z);
  }

  function setFormat(h) {
    root.style.setProperty('--H', h + 'px');
    root.dataset.fmt = h === 1920 ? 'story' : 'ig';
    const ig = document.getElementById('btn-ig'), st = document.getElementById('btn-story');
    if (ig) ig.classList.toggle('on', h !== 1920);
    if (st) st.classList.toggle('on', h === 1920);
    fitAll();
  }

  setFormat(formats && params.get('format') === 'story' ? 1920 : height);
  addEventListener('resize', () => { fitZoom(); fitAll(); });
  fitZoom(); fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

  const btn = id => document.getElementById(id);
  if (formats) {
    if (btn('btn-ig')) btn('btn-ig').onclick = () => setFormat(1350);
    if (btn('btn-story')) btn('btn-story').onclick = () => setFormat(1920);
  }
  if (btn('btn-zoom')) btn('btn-zoom').onclick = e => {
    zoom100 = !zoom100; e.target.classList.toggle('on', zoom100); fitZoom();
  };
  if (btn('btn-safe')) btn('btn-safe').onclick = e => {
    document.body.classList.toggle('show-safe');
    e.target.classList.toggle('on', document.body.classList.contains('show-safe'));
  };

  /* Animations : jouées à l'entrée dans le viewport, rejouables.
     À l'export on ne les lance jamais : chaque élément est déjà à son état final. */
  const all = [...document.querySelectorAll('.slide')];
  const play = el => { el.classList.remove('play'); void el.offsetWidth; el.classList.add('play'); };

  if (STATIC) {
    document.body.classList.add('export');
  } else {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting && !e.target.dataset.done) { e.target.dataset.done = 1; play(e.target); }
    }), { threshold: .25 });
    all.forEach(s => io.observe(s));
    if (btn('btn-play')) btn('btn-play').onclick = () =>
      all.forEach(s => { delete s.dataset.done; play(s); });
  }
}

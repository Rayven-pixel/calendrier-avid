/* Calendrier de l'Avent A.V.I.D – logique côté navigateur.
 * Le navigateur n'a jamais accès aux promotions futures : il reçoit
 * uniquement ce que le serveur autorise à la date du jour. */
(function () {
  'use strict';

  const MONTHS = [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ];
  const CONFETTI_COLORS = ['#b1151f', '#0e3b2b', '#d4af5a', '#f1d894', '#fffdf8'];
  const LOCK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2zM9 9V7a3 3 0 0 1 6 0v2H9z"/>' +
    '</svg>';
  const SEEN_KEY = 'avid-avent-ouvertes';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = (id) => document.getElementById(id);
  const calendarEl = $('calendar');
  const dialog = $('promo');
  const toastEl = $('toast');

  let state = null;
  let clockOffset = 0; // écart entre l'horloge du serveur et celle du visiteur
  let countdownTimer = null;
  let toastTimer = null;
  let activeTrigger = null;

  // ----- Utilitaires -------------------------------------------------------

  function formatDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function openedDays() {
    try {
      return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    } catch {
      return new Set();
    }
  }

  function rememberOpened(day) {
    try {
      const days = openedDays();
      days.add(day);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...days]));
    } catch {
      /* stockage indisponible : le marqueur "ouverte" n'est simplement pas conservé */
    }
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4500);
  }

  // ----- Chargement --------------------------------------------------------

  async function loadCalendar(isFirstLoad) {
    const params = new URLSearchParams(location.search);
    const demo = params.get('demo') === '1';
    try {
      const res = await fetch(demo ? '/api/calendar?demo=1' : '/api/calendar', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = await res.json();
    } catch {
      showToast('Impossible de charger le calendrier. Réessayez dans un instant.');
      return;
    }
    clockOffset = new Date(state.serverNow).getTime() - Date.now();
    renderBanner();
    renderCalendar();
    startCountdown();

    if (isFirstLoad) {
      const preview = Number(params.get('preview'));
      if (preview >= 1 && preview <= 24) openPromo(preview, null);
    }
  }

  // ----- Affichage du calendrier -------------------------------------------

  function renderBanner() {
    const banner = $('demo-banner');
    if (state.demo) {
      banner.textContent = 'Aperçu administrateur : toutes les cases sont ouvertes';
      banner.hidden = false;
    } else if (state.showDemoBanner) {
      banner.textContent = 'Mode démonstration : contenus fictifs';
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  function renderCalendar() {
    const opened = openedDays();
    calendarEl.replaceChildren(...state.days.map((d) => makeDoor(d, opened.has(d.day))));
  }

  function makeDoor(d, wasOpened) {
    const locked = d.status === 'locked' || d.status === 'unavailable';
    const classes = ['door', d.day % 2 ? 'door--red' : 'door--green', `door--${d.status}`];
    if (!locked && wasOpened) classes.push('is-opening');

    const btn = el('button', classes.join(' '));
    btn.type = 'button';
    btn.dataset.day = String(d.day);
    btn.setAttribute('aria-label', labelFor(d, locked, wasOpened));

    const front = el('span', 'door__front');
    front.append(el('span', 'door__num', String(d.day)));
    if (locked) {
      const lock = el('span', 'door__lock');
      lock.innerHTML = LOCK_SVG;
      front.append(lock);
    } else if (d.status === 'expired') {
      front.append(el('span', 'door__mark', 'Expirée'));
    } else {
      front.append(el('span', 'door__mark', 'Ouvrir'));
    }
    front.append(el('span', 'door__seen', '✓ Ouverte'));
    btn.append(front);

    btn.addEventListener('click', () => onDoorClick(btn, d));
    return btn;
  }

  function labelFor(d, locked, wasOpened) {
    if (d.status === 'locked') return `Case ${d.day}, verrouillée. Disponible le ${formatDate(d.unlockDate)}`;
    if (d.status === 'unavailable') return `Case ${d.day}, indisponible`;
    const suffix = d.status === 'expired' ? ', offre expirée' : wasOpened ? ', déjà ouverte' : '';
    return `Case ${d.day}${suffix}`;
  }

  // ----- Interactions ------------------------------------------------------

  function onDoorClick(btn, d) {
    if (btn.classList.contains('is-opening')) {
      openPromo(d.day, btn);
      return;
    }
    if (d.status === 'locked') {
      showToast(`Cette surprise sera disponible le ${formatDate(d.unlockDate)} !`);
      return;
    }
    if (d.status === 'unavailable') {
      showToast("Cette surprise n'est pas disponible pour le moment.");
      return;
    }

    btn.classList.add('is-opening');
    if (reduceMotion) {
      openPromo(d.day, btn);
      return;
    }
    const rect = btn.getBoundingClientRect();
    flash(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setTimeout(() => openPromo(d.day, btn), 650);
  }

  async function openPromo(day, trigger) {
    let promo;
    try {
      const res = await fetch(`/api/promo/${day}`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (trigger) trigger.classList.remove('is-opening');
        if (body.unlockDate) {
          showToast(`Cette surprise sera disponible le ${formatDate(body.unlockDate)} !`);
        } else {
          showToast(body.error || 'Cette surprise est indisponible.');
        }
        return;
      }
      promo = body;
    } catch {
      if (trigger) trigger.classList.remove('is-opening');
      showToast('Connexion impossible. Réessayez.');
      return;
    }

    fillDialog(promo);
    activeTrigger = trigger;
    if (!dialog.open) dialog.showModal();
    $('promo-back').focus({ preventScroll: true });

    if (trigger && !promo.preview) burst();
  }

  function fillDialog(p) {
    const dayLabel = `Case n° ${p.day}${p.preview ? ' · Aperçu administrateur' : ''}`;
    $('promo-day').textContent = dayLabel;
    $('promo-title').textContent = p.title || 'Offre à venir';
    $('promo-discount').textContent = p.discount || '';
    $('promo-discount').hidden = !p.discount;
    $('promo-desc').textContent = p.description || '';
    $('promo-conditions').textContent = p.conditions || 'Conditions communiquées par A.V.I.D.';
    $('promo-validity').textContent =
      `Période de validité : du ${formatDate(p.unlockDate)} au ${formatDate(p.validUntil)}.`;
    $('promo-badge').hidden = p.status !== 'expired';

    const images = p.images && p.images.length ? p.images : ['/images/placeholder.svg'];
    const mainImage = $('promo-image');
    mainImage.src = images[0];
    mainImage.alt = p.title || 'Photo du produit';

    const thumbs = $('promo-thumbs');
    thumbs.replaceChildren();
    if (images.length > 1) {
      images.forEach((src, index) => {
        const button = el('button', 'promo__thumb');
        button.type = 'button';
        button.setAttribute('aria-label', `Afficher la photo ${index + 1}`);
        const img = el('img');
        img.src = src;
        img.alt = '';
        button.append(img);
        button.addEventListener('click', () => { mainImage.src = src; });
        thumbs.append(button);
      });
    }

    fillList($('promo-brands'), p.brands);
    fillList($('promo-refs'), p.references);
  }

  function fillList(ul, items) {
    const list = items && items.length ? items : ['—'];
    ul.replaceChildren(...list.map((text) => el('li', null, text)));
  }

  dialog.addEventListener('close', () => {
    if (activeTrigger) {
      activeTrigger.classList.add('is-opening');
      rememberOpened(Number(activeTrigger.dataset.day));
      activeTrigger.focus({ preventScroll: true });
      activeTrigger = null;
    }
  });

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close(); // clic sur le fond
  });

  $('promo-close').addEventListener('click', () => dialog.close());
  $('promo-back').addEventListener('click', () => dialog.close());

  // ----- Compte à rebours --------------------------------------------------

  function startCountdown() {
    clearInterval(countdownTimer);
    tickCountdown();
    countdownTimer = setInterval(tickCountdown, 1000);
  }

  function tickCountdown() {
    const box = $('countdown-label').parentElement;
    box.hidden = Boolean(state.demo);
    if (state.demo) return;
    const label = $('countdown-label');
    const time = $('countdown-time');

    if (!state.nextUnlockAt) {
      clearInterval(countdownTimer);
      label.textContent = 'Campagne';
      time.textContent = 'Toutes les cases sont disponibles';
      return;
    }

    const remaining = new Date(state.nextUnlockAt).getTime() - (Date.now() + clockOffset);
    if (remaining <= 0) {
      clearInterval(countdownTimer);
      loadCalendar(false);
      return;
    }

    const total = Math.floor(remaining / 1000);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (n) => String(n).padStart(2, '0');

    label.textContent = 'Prochaine case disponible dans';
    time.textContent = `${days > 0 ? `${days} j · ` : ''}${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`;
  }

  // ----- Effets visuels ----------------------------------------------------

  /** Halo lumineux au moment de l'ouverture. */
  function flash(x, y) {
    if (reduceMotion) return;
    const node = el('div', 'flash');
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    document.body.append(node);
    node.addEventListener('animationend', () => node.remove());
  }

  /** Confettis légers (une quarantaine d'éléments, retirés après l'animation). */
  function burst() {
    if (reduceMotion) return;
    const x = window.innerWidth / 2;
    const y = window.innerHeight * 0.3;
    for (let i = 0; i < 44; i += 1) {
      const piece = el('span', 'confetti');
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.left = `${x}px`;
      piece.style.top = `${y}px`;
      document.body.append(piece);

      const angle = Math.random() * Math.PI * 2;
      const distance = 120 + Math.random() * 220;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance - 60;
      const spin = Math.random() * 720 - 360;
      const animation = piece.animate(
        [
          { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 320}px)) rotate(${spin}deg)`,
            opacity: 0,
          },
        ],
        { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' }
      );
      animation.onfinish = () => piece.remove();
    }
  }

  // ----- Démarrage ---------------------------------------------------------

  loadCalendar(true);
})();

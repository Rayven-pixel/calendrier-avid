/* Espace administrateur – Calendrier de l'Avent A.V.I.D */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

  let data = null;        // { config, promotions }
  let currentDay = 1;
  let images = [];        // photos de la case en cours d'édition

  // ----- Appels API --------------------------------------------------------

  async function api(url, options = {}) {
    const init = { method: options.method || 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (options.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(json.error || `Erreur ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return json;
  }

  function setMsg(id, text, ok = true) {
    const node = $(id);
    node.textContent = text || '';
    node.className = `msg ${ok ? 'msg--ok' : 'msg--err'}`;
    node.hidden = !text;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
      reader.readAsDataURL(file);
    });
  }

  // ----- Connexion ---------------------------------------------------------

  async function showDashboard() {
    await loadData();
    $('login-view').hidden = true;
    $('dashboard-view').hidden = false;
  }

  async function loadData() {
    data = await api('/api/admin/data');
    renderConfig();
    renderDays();
    selectDay(currentDay);
    $('public-url').value = $('public-url').value || `${location.origin}/`;
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    setMsg('login-msg', '');
    try {
      await api('/api/admin/login', { method: 'POST', body: { password: $('password').value } });
      $('password').value = '';
      await showDashboard();
    } catch (err) {
      setMsg('login-msg', err.message, false);
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
    location.reload();
  });

  // ----- Campagne ----------------------------------------------------------

  function renderConfig() {
    const form = $('config-form').elements;
    form.campaignYear.value = data.config.campaignYear;
    form.showDemoBanner.checked = Boolean(data.config.showDemoBanner);
  }

  $('config-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget.elements;
    try {
      const res = await api('/api/admin/config', {
        method: 'PUT',
        body: { campaignYear: Number(form.campaignYear.value), showDemoBanner: form.showDemoBanner.checked },
      });
      data.config = res.config;
      setMsg('config-msg', 'Campagne enregistrée.');
    } catch (err) {
      setMsg('config-msg', err.message, false);
    }
  });

  // ----- Liste des cases ---------------------------------------------------

  function renderDays() {
    const list = $('day-list');
    list.replaceChildren(
      ...data.promotions.map((p) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `day-item${p.day === currentDay ? ' is-active' : ''}`;
        button.append(
          textSpan('day-item__num', `Case ${p.day}`),
          textSpan('day-item__title', p.title || 'À compléter'),
          textSpan('day-item__state', p.enabled ? 'Active' : 'Désactivée')
        );
        button.addEventListener('click', () => selectDay(p.day));
        return button;
      })
    );
  }

  function textSpan(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  // ----- Édition d'une case ------------------------------------------------

  function selectDay(day) {
    currentDay = day;
    const p = data.promotions.find((item) => item.day === day);
    const form = $('editor').elements;
    form.enabled.checked = Boolean(p.enabled);
    form.title.value = p.title || '';
    form.discount.value = p.discount || '';
    form.references.value = (p.references || []).join(', ');
    form.description.value = p.description || '';
    form.brands.value = (p.brands || []).join(', ');
    form.conditions.value = p.conditions || '';
    form.publishAt.value = p.publishAt || '';
    form.validUntil.value = p.validUntil || '';
    images = [...(p.images || [])];

    $('editor-title').textContent = `Case n° ${day}`;
    setMsg('editor-msg', '');
    renderImages();
    renderDays();
  }

  function renderImages() {
    const box = $('image-list');
    box.replaceChildren(
      ...images.map((src, index) => {
        const figure = document.createElement('figure');
        figure.className = 'img-item';
        const img = document.createElement('img');
        img.src = src;
        img.alt = `Photo ${index + 1}`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-small btn-danger';
        remove.textContent = 'Retirer';
        remove.addEventListener('click', () => {
          images.splice(index, 1);
          renderImages();
        });
        figure.append(img, remove);
        return figure;
      })
    );
    if (!images.length) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent = 'Aucune photo : la photo de démonstration sera affichée.';
      box.append(note);
    }
  }

  $('upload-btn').addEventListener('click', async () => {
    const input = $('image-input');
    const file = input.files[0];
    if (!file) return setMsg('editor-msg', 'Choisissez d\'abord une image.', false);
    if (file.size > MAX_IMAGE_BYTES) return setMsg('editor-msg', 'Image trop lourde (2 Mo maximum).', false);
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await api('/api/admin/upload', { method: 'POST', body: { data: dataUrl } });
      images.push(res.url);
      input.value = '';
      renderImages();
      setMsg('editor-msg', 'Photo importée. Enregistrez la case pour la conserver.');
    } catch (err) {
      setMsg('editor-msg', err.message, false);
    }
  });

  $('editor').addEventListener('submit', async (event) => {
    event.preventDefault();
    const f = event.currentTarget.elements;
    const body = {
      enabled: f.enabled.checked,
      title: f.title.value,
      discount: f.discount.value,
      references: f.references.value,
      description: f.description.value,
      brands: f.brands.value,
      conditions: f.conditions.value,
      publishAt: f.publishAt.value,
      validUntil: f.validUntil.value,
      images,
    };
    try {
      const saved = await api(`/api/admin/promotions/${currentDay}`, { method: 'PUT', body });
      const index = data.promotions.findIndex((p) => p.day === currentDay);
      data.promotions[index] = saved;
      renderDays();
      setMsg('editor-msg', 'Case enregistrée.');
    } catch (err) {
      setMsg('editor-msg', err.message, false);
    }
  });

  $('preview-btn').addEventListener('click', () => {
    window.open(`/?preview=${currentDay}`, '_blank', 'noopener');
  });

  // ----- QR code -----------------------------------------------------------

  $('qr-btn').addEventListener('click', () => {
    const url = $('public-url').value.trim() || `${location.origin}/`;
    const qr = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=12&data=${encodeURIComponent(url)}`;
    $('qr-img').src = qr;
    $('qr-link').href = qr;
    $('qr-box').hidden = false;
  });

  // ----- Démarrage : session existante ? ----------------------------------

  (async function boot() {
    try {
      await showDashboard();
    } catch {
      $('login-view').hidden = false;
    }
  })();
})();

'use strict';

/**
 * Serveur du calendrier de l'Avent A.V.I.D.
 * Aucune dépendance externe : uniquement les modules intégrés de Node.js (>= 18).
 *
 * Sécurité principale : les promotions futures ne sont JAMAIS envoyées au navigateur.
 * Le serveur filtre les cases selon la date du jour (fuseau Europe/Paris).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parisDateString } = require('./lib/dates');
const { unlockDateFor, endOfValidity, promoStatus, nextUnlock } = require('./lib/status');
const store = require('./lib/store');
const auth = require('./lib/auth');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const MAX_JSON_BODY = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https://api.qrserver.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
}

function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/** Exige du JSON : un formulaire HTML externe ne peut pas envoyer ce type sans CORS (protection CSRF). */
async function readJson(req, limit = MAX_JSON_BODY) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type application/json requis.');
  }
  const raw = await readRawBody(req, limit);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON invalide.');
  }
}

function parseDay(value) {
  const day = Number(value);
  if (!Number.isInteger(day) || day < 1 || day > 24) throw new HttpError(404, 'Case introuvable.');
  return day;
}

function findPromo(data, day) {
  return data.promotions.find((p) => p.day === day);
}

function sniffImageExtension(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Routes publiques
// ---------------------------------------------------------------------------

/** Calendrier : ne renvoie que le strict nécessaire pour chaque case. */
function getCalendar(req, res, params) {
  const now = new Date();
  const data = store.read();
  const year = data.config.campaignYear;
  const demo = params.get('demo') === '1' && auth.isAdmin(req);

  const days = [...data.promotions]
    .sort((a, b) => a.day - b.day)
    .map((promo) => {
      const status = demo ? (promo.enabled ? 'open' : 'unavailable') : promoStatus(promo, year, now);
      const base = { day: promo.day, status, unlockDate: unlockDateFor(promo, year) };
      if (status === 'locked' || status === 'unavailable') return base; // rien d'autre n'est transmis
      return {
        ...base,
        title: promo.title,
        discount: promo.discount,
        thumb: promo.images[0] || null,
      };
    });

  const next = demo ? null : nextUnlock(data.promotions, year, now);
  sendJson(res, 200, {
    serverNow: now.toISOString(),
    today: parisDateString(now),
    campaignYear: year,
    showDemoBanner: data.config.showDemoBanner,
    demo,
    nextUnlockAt: next ? next.toISOString() : null,
    days,
  });
}

/** Détail d'une case : refusé tant que la case n'est pas disponible (sauf pour l'administrateur). */
function getPromo(req, res, day) {
  const data = store.read();
  const promo = findPromo(data, day);
  if (!promo) throw new HttpError(404, 'Case introuvable.');
  const year = data.config.campaignYear;
  const status = promoStatus(promo, year, new Date());
  const admin = auth.isAdmin(req);
  const hidden = status === 'locked' || status === 'unavailable';

  if (hidden && !admin) {
    throw new HttpError(403, status === 'locked' ? "Cette surprise n'est pas encore disponible." : "Cette surprise n'est pas disponible.", {
      status,
      unlockDate: unlockDateFor(promo, year),
    });
  }

  sendJson(res, 200, {
    day: promo.day,
    status,
    preview: admin && hidden,
    unlockDate: unlockDateFor(promo, year),
    validUntil: endOfValidity(promo, year),
    title: promo.title,
    discount: promo.discount,
    description: promo.description,
    brands: promo.brands,
    references: promo.references,
    conditions: promo.conditions,
    images: promo.images,
  });
}

// ---------------------------------------------------------------------------
// Routes administrateur
// ---------------------------------------------------------------------------

function login(req, res) {
  return readJson(req, 10_000).then((body) => {
    const ip = req.socket.remoteAddress || 'inconnu';
    if (auth.isBlocked(ip)) {
      throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
    }
    if (typeof body.password !== 'string' || !auth.checkPassword(body.password)) {
      auth.recordFailure(ip);
      throw new HttpError(401, 'Mot de passe incorrect.');
    }
    auth.clearFailures(ip);
    sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.sessionCookie(req, auth.createToken()) });
  });
}

function logout(req, res) {
  sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.clearSessionCookie(req) });
}

async function handleAdmin(req, res, pathname, method) {
  if (method === 'GET' && pathname === '/api/admin/me') return sendJson(res, 200, { ok: true });

  if (method === 'GET' && pathname === '/api/admin/data') {
    const data = store.read();
    return sendJson(res, 200, { serverNow: new Date().toISOString(), config: data.config, promotions: data.promotions });
  }

  if (method === 'PUT' && pathname === '/api/admin/config') {
    const body = await readJson(req);
    return sendJson(res, 200, { config: store.updateConfig(body) });
  }

  const promoMatch = pathname.match(/^\/api\/admin\/promotions\/(\d{1,2})$/);
  if (method === 'PUT' && promoMatch) {
    const day = parseDay(promoMatch[1]);
    const body = await readJson(req);
    return sendJson(res, 200, store.updatePromotion(day, body));
  }

  if (method === 'POST' && pathname === '/api/admin/upload') {
    const body = await readJson(req, MAX_JSON_BODY);
    const base64 = String(body.data || '').replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) throw new HttpError(400, 'Fichier vide.');
    if (buffer.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Image trop lourde (2 Mo maximum).');
    const ext = sniffImageExtension(buffer);
    if (!ext) throw new HttpError(415, 'Format non pris en charge (JPEG, PNG ou WebP).');
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const name = `${crypto.randomUUID()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
    return sendJson(res, 201, { url: `/uploads/${name}` });
  }

  throw new HttpError(404, 'Route introuvable.');
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;
  const method = req.method;

  if (method === 'GET' && pathname === '/api/calendar') return getCalendar(req, res, searchParams);

  const promoMatch = pathname.match(/^\/api\/promo\/(\d{1,2})$/);
  if (method === 'GET' && promoMatch) return getPromo(req, res, parseDay(promoMatch[1]));

  if (method === 'POST' && pathname === '/api/admin/login') return login(req, res);
  if (method === 'POST' && pathname === '/api/admin/logout') return logout(req, res);

  if (pathname.startsWith('/api/admin/')) {
    if (!auth.isAdmin(req)) throw new HttpError(401, 'Authentification requise.');
    return handleAdmin(req, res, pathname, method);
  }

  throw new HttpError(404, 'Route introuvable.');
}

// ---------------------------------------------------------------------------
// Fichiers statiques
// ---------------------------------------------------------------------------

function serveStatic(req, res, pathname) {
  let rel = pathname;
  if (rel === '/') rel = '/index.html';
  else if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';

  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    throw new HttpError(400, 'Requête invalide.');
  }

  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));
  const insidePublic = filePath.startsWith(PUBLIC_DIR + path.sep);
  const hidden = path.basename(filePath).startsWith('.');
  if (!insidePublic || hidden) throw new HttpError(404, 'Fichier introuvable.');

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      if (!res.headersSent) sendJson(res, 404, { error: 'Fichier introuvable.' });
      return;
    }
    const type = MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stats.size,
      'Cache-Control': req.url.includes('/uploads/') ? 'public, max-age=86400' : 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------------------------------------------------------------------------
// Serveur
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
    } else {
      throw new HttpError(405, 'Méthode non autorisée.');
    }
  } catch (err) {
    const known = err instanceof HttpError || (typeof err.status === 'number' && err.status < 500);
    const status = known ? err.status : 500;
    if (!known) console.error(err);
    if (!res.headersSent) {
      sendJson(res, status, {
        error: known ? err.message : 'Erreur interne du serveur.',
        ...(err.extra || {}),
      });
    }
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Calendrier de l'Avent A.V.I.D : http://localhost:${PORT}`);
    console.log(`Espace administrateur : http://localhost:${PORT}/admin`);
  });
}

module.exports = { server };

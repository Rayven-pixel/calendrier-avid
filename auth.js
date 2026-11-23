'use strict';

/**
 * Authentification de l'espace administrateur :
 *  - mot de passe fourni par la variable d'environnement ADMIN_PASSWORD ;
 *  - session = jeton signé HMAC stocké dans un cookie HttpOnly / SameSite=Strict ;
 *  - limitation des tentatives de connexion par adresse IP.
 */

const crypto = require('crypto');

const COOKIE_NAME = 'avid_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 heures
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

let PASSWORD = process.env.ADMIN_PASSWORD;
if (!PASSWORD) {
  PASSWORD = crypto.randomBytes(12).toString('base64url');
  console.warn(
    `[AVERTISSEMENT] ADMIN_PASSWORD non défini. Mot de passe administrateur temporaire : ${PASSWORD}\n` +
      '  -> Définissez ADMIN_PASSWORD avant toute mise en ligne.'
  );
}

const PASSWORD_DIGEST = crypto.createHash('sha256').update(PASSWORD).digest();

function checkPassword(input) {
  const digest = crypto.createHash('sha256').update(input).digest();
  return crypto.timingSafeEqual(digest, PASSWORD_DIGEST);
}

function sign(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function createToken() {
  const expires = String(Date.now() + SESSION_TTL_MS);
  return `${expires}.${sign(expires)}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature) return false;
  if (Number(expires) < Date.now()) return false;
  const a = Buffer.from(signature);
  const b = Buffer.from(sign(expires));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readCookie(req, name = COOKIE_NAME) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

function isAdmin(req) {
  return verifyToken(readCookie(req));
}

function isSecureRequest(req) {
  return process.env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
}

function sessionCookie(req, token) {
  const parts = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${SESSION_TTL_MS / 1000}`];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(req) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  return parts.join('; ');
}

const attempts = new Map();

function isBlocked(ip) {
  const entry = attempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
  else entry.count += 1;
}

function clearFailures(ip) {
  attempts.delete(ip);
}

module.exports = {
  checkPassword,
  createToken,
  verifyToken,
  isAdmin,
  sessionCookie,
  clearSessionCookie,
  isBlocked,
  recordFailure,
  clearFailures,
};

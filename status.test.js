'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { promoStatus, nextUnlock, unlockDateFor } = require('../lib/status');

const promo = (day, extra = {}) => ({ day, enabled: true, publishAt: '', validUntil: '', ...extra });

test('une case future reste verrouillée', () => {
  assert.equal(promoStatus(promo(5), 2026, new Date('2026-12-04T12:00:00Z')), 'locked');
});

test('une case du jour est disponible à Paris', () => {
  assert.equal(promoStatus(promo(5), 2026, new Date('2026-12-05T12:00:00Z')), 'open');
});

test('une case passée reste ouverte tant que la validité n\'est pas dépassée', () => {
  assert.equal(promoStatus(promo(2), 2026, new Date('2026-12-20T12:00:00Z')), 'open');
});

test('une case dont la validité est dépassée est expirée', () => {
  const p = promo(2, { validUntil: '2026-12-10' });
  assert.equal(promoStatus(p, 2026, new Date('2026-12-11T12:00:00Z')), 'expired');
});

test('une case désactivée est indisponible', () => {
  assert.equal(promoStatus(promo(5, { enabled: false }), 2026, new Date('2026-12-20T12:00:00Z')), 'unavailable');
});

test('la date de publication remplace la date par défaut', () => {
  const p = promo(5, { publishAt: '2026-12-02' });
  assert.equal(unlockDateFor(p, 2026), '2026-12-02');
  assert.equal(promoStatus(p, 2026, new Date('2026-12-02T08:00:00Z')), 'open');
});

test('nextUnlock donne le prochain déblocage à minuit Paris', () => {
  const promos = [promo(1), promo(2), promo(3)];
  const next = nextUnlock(promos, 2026, new Date('2026-12-01T12:00:00Z'));
  assert.equal(next.toISOString(), '2026-12-01T23:00:00.000Z');
});

test('nextUnlock renvoie null quand tout est ouvert', () => {
  assert.equal(nextUnlock([promo(1)], 2026, new Date('2026-12-30T12:00:00Z')), null);
});

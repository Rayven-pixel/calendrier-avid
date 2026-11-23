'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parisDateString, parisMidnight, isValidDateString } = require('../lib/dates');

test('parisDateString utilise le jour calendaire de Paris', () => {
  // 23:30 UTC le 30 novembre = 00:30 à Paris le 1er décembre (UTC+1 en hiver)
  assert.equal(parisDateString(new Date('2026-11-30T23:30:00Z')), '2026-12-01');
  assert.equal(parisDateString(new Date('2026-11-30T22:30:00Z')), '2026-11-30');
});

test('parisMidnight renvoie minuit à Paris', () => {
  assert.equal(parisMidnight('2026-12-05').toISOString(), '2026-12-04T23:00:00.000Z');
});

test('parisMidnight gère l\'heure d\'été', () => {
  assert.equal(parisMidnight('2026-07-14').toISOString(), '2026-07-13T22:00:00.000Z');
});

test('isValidDateString', () => {
  assert.equal(isValidDateString('2026-12-24'), true);
  assert.equal(isValidDateString('2026-13-45'), false);
  assert.equal(isValidDateString('24/12/2026'), false);
});

'use strict';

/**
 * Règles d'accès aux cases. Fonctions pures : faciles à tester.
 *
 * Statuts possibles pour une case :
 *  - 'locked'      : pas encore disponible (contenu NON transmis au client)
 *  - 'open'        : disponible aujourd'hui ou plus tôt, toujours valable
 *  - 'expired'     : disponible un jour passé, mais fin de validité dépassée
 *  - 'unavailable' : désactivée par l'administrateur (contenu NON transmis)
 */

const { parisDateString, parisMidnight } = require('./dates');

/** Date (AAAA-MM-JJ) à partir de laquelle la case est visible. */
function unlockDateFor(promo, year) {
  if (promo.publishAt) return promo.publishAt;
  return `${year}-12-${String(promo.day).padStart(2, '0')}`;
}

/** Dernier jour de validité (valeur par défaut : fin de campagne, 24 décembre). */
function endOfValidity(promo, year) {
  return promo.validUntil || `${year}-12-24`;
}

function promoStatus(promo, year, now = new Date()) {
  if (!promo.enabled) return 'unavailable';
  const today = parisDateString(now);
  if (today < unlockDateFor(promo, year)) return 'locked';
  if (today > endOfValidity(promo, year)) return 'expired';
  return 'open';
}

/** Instant (Date) du prochain déblocage à venir, ou null s'il n'en reste aucun. */
function nextUnlock(promos, year, now = new Date()) {
  const today = parisDateString(now);
  let best = null;
  for (const promo of promos) {
    if (!promo.enabled) continue;
    const unlock = unlockDateFor(promo, year);
    if (unlock > today && (best === null || unlock < best)) best = unlock;
  }
  return best ? parisMidnight(best) : null;
}

module.exports = { unlockDateFor, endOfValidity, promoStatus, nextUnlock };

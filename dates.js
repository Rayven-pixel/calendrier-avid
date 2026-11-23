'use strict';

/**
 * Gestion des dates dans le fuseau Europe/Paris.
 * Toute la logique "quelle case est disponible aujourd'hui" passe par ce module,
 * côté serveur uniquement : le navigateur ne décide jamais seul de l'accès.
 */

const TZ = 'Europe/Paris';

const dayFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partsOf(formatter, date) {
  const out = {};
  for (const part of formatter.formatToParts(date)) out[part.type] = part.value;
  return out;
}

/** Date calendaire (AAAA-MM-JJ) à Paris, pour un instant donné. */
function parisDateString(date = new Date()) {
  const p = partsOf(dayFormatter, date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Décalage de Paris par rapport à UTC, en minutes (60 en hiver, 120 en été). */
function parisOffsetMinutes(date) {
  const p = partsOf(clockFormatter, date);
  const wallClockAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const instant = date.getTime() - date.getMilliseconds();
  return Math.round((wallClockAsUtc - instant) / 60000);
}

/** Instant exact où commence une date (AAAA-MM-JJ) à minuit à Paris. */
function parisMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offset = parisOffsetMinutes(new Date(guess));
  let instant = guess - offset * 60000;
  const check = parisOffsetMinutes(new Date(instant));
  if (check !== offset) instant = guess - check * 60000;
  return new Date(instant);
}

function isValidDateString(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

module.exports = {
  TZ,
  parisDateString,
  parisOffsetMinutes,
  parisMidnight,
  isValidDateString,
};

'use strict';

/**
 * Stockage centralisé des promotions dans un fichier JSON.
 * Toutes les données entrantes (depuis l'espace admin) sont validées ici.
 */

const fs = require('fs');
const path = require('path');
const { isValidDateString } = require('./dates');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'promotions.json');
const IMAGE_PATH = /^\/(uploads|images)\/[A-Za-z0-9._-]+$/;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function read() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

/** Écriture atomique : on écrit un fichier temporaire puis on le renomme. */
function write(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, DATA_FILE);
}

function text(value, max, label) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${label} doit être un texte.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${label} : ${max} caractères maximum.`);
  return trimmed;
}

function list(value, maxItems, itemMax, label) {
  let items = [];
  if (Array.isArray(value)) items = value;
  else if (typeof value === 'string') items = value.split(/[\n,;]/);
  items = items.map((item) => String(item).trim()).filter(Boolean);
  if (items.length > maxItems) throw new ValidationError(`${label} : ${maxItems} éléments maximum.`);
  for (const item of items) {
    if (item.length > itemMax) throw new ValidationError(`${label} : élément trop long.`);
  }
  return items;
}

function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return '';
  if (!isValidDateString(value)) throw new ValidationError(`${label} : format attendu AAAA-MM-JJ.`);
  return value;
}

function images(value) {
  const items = list(value, 6, 200, 'Photos');
  for (const src of items) {
    if (!IMAGE_PATH.test(src) || src.includes('..')) {
      throw new ValidationError('Chemin de photo invalide.');
    }
  }
  return items;
}

function sanitizePromotion(input, day) {
  if (typeof input !== 'object' || input === null) throw new ValidationError('Données invalides.');
  const clean = {
    day,
    enabled: Boolean(input.enabled),
    publishAt: optionalDate(input.publishAt, 'Date de publication'),
    validUntil: optionalDate(input.validUntil, 'Fin de validité'),
    title: text(input.title, 140, 'Titre'),
    discount: text(input.discount, 60, 'Remise ou prix'),
    description: text(input.description, 2000, 'Description'),
    brands: list(input.brands, 12, 80, 'Marques'),
    references: list(input.references, 40, 60, 'Références'),
    conditions: text(input.conditions, 2000, 'Conditions'),
    images: images(input.images),
  };
  if (clean.enabled && !clean.title) {
    throw new ValidationError('Un titre est requis pour activer la promotion.');
  }
  if (clean.publishAt && clean.validUntil && clean.validUntil < clean.publishAt) {
    throw new ValidationError('La fin de validité doit être postérieure à la date de publication.');
  }
  return clean;
}

function updatePromotion(day, input) {
  const data = read();
  const index = data.promotions.findIndex((p) => p.day === day);
  if (index === -1) throw Object.assign(new Error('Case introuvable.'), { status: 404 });
  const clean = sanitizePromotion(input, day);
  data.promotions[index] = clean;
  write(data);
  return clean;
}

function updateConfig(input) {
  const data = read();
  const year = Number(input.campaignYear);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new ValidationError("Année de campagne invalide.");
  }
  data.config.campaignYear = year;
  if (typeof input.showDemoBanner === 'boolean') data.config.showDemoBanner = input.showDemoBanner;
  write(data);
  return data.config;
}

module.exports = { DATA_FILE, read, write, updatePromotion, updateConfig, ValidationError };

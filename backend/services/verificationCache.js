'use strict';

/**
 * In-memory verification result cache with TTL.
 * Keyed by lowercase email address.
 * Automatic purge of expired entries on every write.
 */

const TTL_MS = (parseInt(process.env.CACHE_TTL_DAYS, 10) || 30) * 24 * 60 * 60 * 1000;

const store = new Map(); // email → { result, expiresAt }

function normalise(email) {
  return String(email || '').toLowerCase().trim();
}

function has(email) {
  const key = normalise(email);
  const entry = store.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) { store.delete(key); return false; }
  return true;
}

function get(email) {
  const key = normalise(email);
  const entry = store.get(key);
  if (!entry || Date.now() > entry.expiresAt) { store.delete(key); return null; }
  return entry.result;
}

function set(email, result) {
  purgeExpired();
  store.set(normalise(email), { result, expiresAt: Date.now() + TTL_MS });
}

function purgeExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key);
  }
}

function size() {
  purgeExpired();
  return store.size;
}

module.exports = { has, get, set, purgeExpired, size };

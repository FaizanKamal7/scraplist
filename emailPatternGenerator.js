/**
 * emailPatternGenerator.js
 * Shared module — works in both the Chrome extension (browser) and the
 * Node.js backend (required via CommonJS).
 *
 * Pure function: no network calls, no side effects.
 * Generates common B2B email address patterns ordered by real-world frequency.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(); // Node / CommonJS
  } else {
    root.EmailPatternGenerator = factory(); // Browser global
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Normalise a name segment for use inside an email local-part:
   *   - Strip diacritics (é → e)
   *   - Lowercase
   *   - Remove everything that is not a-z or 0-9
   */
  function norm(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Generate candidate email addresses from a first name, last name and domain.
   *
   * @param {string} firstName
   * @param {string} lastName
   * @param {string} domain      e.g. "stripe.com"
   * @returns {Array<{email: string, pattern: string, confidence: number}>}
   *          Ordered by confidence descending. Empty array on bad input.
   */
  function generateEmailPatterns(firstName, lastName, domain) {
    const f = norm(firstName);
    const l = norm(lastName);
    const d = String(domain || '').toLowerCase().trim();

    if (!f || !l || !d || !d.includes('.')) return [];

    const fi = f[0]; // first initial
    const li = l[0]; // last initial

    // De-duplicate while preserving order
    const seen    = new Set();
    const results = [];

    function add(email, pattern, confidence) {
      if (!email || seen.has(email)) return;
      seen.add(email);
      results.push({ email, pattern, confidence });
    }

    // Patterns ordered by B2B frequency (Hunter.io published research)
    add(`${f}.${l}@${d}`,    '{first}.{last}',    42);
    add(`${f}@${d}`,          '{first}',           18);
    add(`${fi}${l}@${d}`,     '{f}{last}',         15);
    add(`${f}${l}@${d}`,      '{first}{last}',      9);
    add(`${fi}.${l}@${d}`,    '{f}.{last}',         4);
    add(`${f}.${li}@${d}`,    '{first}.{l}',        4);
    add(`${l}.${f}@${d}`,     '{last}.{first}',     3);
    add(`${l}${f}@${d}`,      '{last}{first}',      2);
    add(`${l}@${d}`,           '{last}',             2);
    add(`${f}_${l}@${d}`,     '{first}_{last}',     1);

    return results;
  }

  return { generateEmailPatterns };
}));

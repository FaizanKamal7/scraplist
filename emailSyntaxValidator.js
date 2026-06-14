/**
 * emailSyntaxValidator.js
 * Shared module — works in both the Chrome extension (browser) and the
 * Node.js backend (required via CommonJS).
 *
 * Pure function: no network calls, no side effects.
 * Validates email syntax per RFC-5321/5322.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.EmailSyntaxValidator = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Covers the vast majority of real-world valid B2B email addresses.
  // Deliberately conservative: rejects edge-cases like quoted locals and IP literals
  // that are valid per spec but never appear in practice.
  const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

  /**
   * Returns true if the string is a syntactically valid email address.
   * Does NOT make any network calls.
   *
   * @param {string} email
   * @returns {boolean}
   */
  function isValidEmailSyntax(email) {
    if (typeof email !== 'string') return false;
    if (email.length > 254) return false;          // RFC 5321 §4.5.3.1.3

    const atIdx = email.lastIndexOf('@');
    if (atIdx < 1) return false;

    const local  = email.slice(0, atIdx);
    const domain = email.slice(atIdx + 1);

    if (local.length > 64) return false;           // RFC 5321 §4.5.3.1.1
    if (domain.length > 253) return false;         // RFC 5321 §4.5.3.1.2

    return EMAIL_RE.test(email);
  }

  /**
   * Filters a list of candidate objects (each having an .email field)
   * to only those with valid syntax.
   *
   * @param {Array<{email: string, [key: string]: any}>} candidates
   * @returns {Array}
   */
  function filterValidCandidates(candidates) {
    return (candidates || []).filter(c => isValidEmailSyntax(c.email));
  }

  /**
   * Validates a plain array of email strings and returns only valid ones.
   *
   * @param {string[]} emails
   * @returns {string[]}
   */
  function filterValidEmails(emails) {
    return (emails || []).filter(isValidEmailSyntax);
  }

  return { isValidEmailSyntax, filterValidCandidates, filterValidEmails };
}));

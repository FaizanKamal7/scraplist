/**
 * emailVerifierClient.js
 * Chrome extension only — browser context.
 *
 * Sends generated candidate emails to your own backend for DNS + SMTP
 * verification. Handles client-side rate limiting, timeouts, and error
 * normalisation so popup.js stays clean.
 */

window.EmailVerifierClient = (function () {
  'use strict';

  const DEFAULT_BACKEND_URL   = 'http://localhost:3001';
  const REQUEST_TIMEOUT_MS    = 35000;  // backend can take up to ~30 s for SMTP
  const MIN_INTERVAL_MS       = 1200;   // min gap between calls (client-side throttle)

  let lastCallAt = 0;

  /**
   * Verify a single lead's candidate emails against your backend.
   *
   * @param {object} params
   * @param {string}   params.leadId
   * @param {string}   params.firstName
   * @param {string}   params.lastName
   * @param {string}   params.companyDomain   e.g. "stripe.com"
   * @param {string}   [params.linkedinUrl]
   * @param {string[]} params.candidateEmails  already syntax-filtered list
   * @param {string}   [params.backendUrl]     overrides DEFAULT_BACKEND_URL
   *
   * @returns {Promise<{
   *   best_email:   string,
   *   status:       'valid'|'catch_all'|'invalid'|'no_mx'|'invalid_format'|'unknown',
   *   confidence:   number,
   *   reason:       string,
   *   mx_host:      string|null,
   *   is_catch_all: boolean,
   *   checked_at:   string,
   *   from_cache:   boolean,
   *   lead_id:      string|null
   * }>}
   */
  async function verifyLeadEmails({
    leadId,
    firstName,
    lastName,
    companyDomain,
    linkedinUrl   = '',
    candidateEmails,
    backendUrl,
  }) {
    // ── Client-side throttle ───────────────────────────────────────────────
    const gap = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (gap > 0) await sleep(gap);
    lastCallAt = Date.now();

    const endpoint = `${(backendUrl || DEFAULT_BACKEND_URL).replace(/\/$/, '')}/api/email-verifier/verify`;

    const body = {
      lead_id:          leadId         || null,
      first_name:       firstName      || '',
      last_name:        lastName       || '',
      company_domain:   companyDomain  || '',
      linkedin_url:     linkedinUrl    || '',
      candidate_emails: candidateEmails || [],
    };

    // ── Abort controller for timeout ───────────────────────────────────────
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 429) {
        throw new Error('Backend rate limit reached — wait a minute before verifying more emails.');
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Backend error ${res.status}: ${txt.slice(0, 200)}`);
      }

      return await res.json();

    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Verification timed out (35 s). Backend may be slow or unreachable.');
      }
      throw err;
    }
  }

  /**
   * Check that the backend is reachable (calls GET /health).
   * Returns true on success, false or throws on failure.
   */
  async function pingBackend(backendUrl) {
    const url = `${(backendUrl || DEFAULT_BACKEND_URL).replace(/\/$/, '')}/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return res.ok;
    } catch (_) {
      return false;
    }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  return { verifyLeadEmails, pingBackend };
}());

'use strict';

const { smtpVerifyEmail } = require('./smtpVerifier');

/**
 * Detect whether a domain accepts mail for any recipient (catch-all).
 *
 * Strategy: probe a random address that cannot exist.
 * If the MX accepts it → catch-all domain → individual RCPT TO results are meaningless.
 *
 * @param {string} mxHost   MX hostname to probe
 * @param {string} domain   Target domain (used to build the fake address)
 * @returns {Promise<boolean>}
 */
async function isCatchAllDomain(mxHost, domain) {
  if (!mxHost || !domain) return false;

  const rand    = Math.random().toString(36).slice(2, 10);
  const ts      = Date.now().toString(36);
  const fakeAddr = `noreply-verify-${rand}-${ts}@${domain}`;

  try {
    const result = await smtpVerifyEmail(mxHost, fakeAddr);
    return result.accepted === true;
  } catch (_) {
    return false;
  }
}

module.exports = { isCatchAllDomain };

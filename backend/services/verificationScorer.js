'use strict';

/**
 * Score the outcome of an SMTP verification attempt into a human-readable status.
 *
 * Status values:
 *   valid          — SMTP accepted RCPT TO, domain is NOT catch-all
 *   catch_all      — SMTP accepted RCPT TO, but domain accepts anything (unreliable)
 *   invalid        — SMTP explicitly rejected RCPT TO (5xx code)
 *   no_mx          — Domain has no MX records (no email service at all)
 *   invalid_format — Email address failed RFC-5321 syntax check before SMTP
 *   unknown        — Temporary failure, timeout, or connection error
 *
 * @param {object} p
 * @param {{ accepted: boolean, code: number|null, message: string, timedOut: boolean, error: string|null }|null} p.smtpResult
 * @param {boolean} p.isCatchAll
 * @param {boolean} p.hasMX
 * @param {boolean} p.syntaxValid
 *
 * @returns {{ status: string, confidence: number, reason: string }}
 */
function scoreVerification({ smtpResult, isCatchAll, hasMX, syntaxValid }) {

  if (!syntaxValid) {
    return { status: 'invalid_format', confidence: 0, reason: 'Email address syntax is invalid' };
  }

  if (!hasMX) {
    return { status: 'no_mx', confidence: 0, reason: 'Domain has no MX records — no email service configured' };
  }

  if (!smtpResult) {
    return { status: 'unknown', confidence: 10, reason: 'No SMTP result available' };
  }

  if (smtpResult.timedOut || smtpResult.error) {
    // Port 25 is blocked (common on cloud VPS) or the server dropped the connection.
    // The domain HAS MX records so it does receive email — we just can't probe it.
    // Treat it like catch-all: return the best-guess email at low confidence rather
    // than leaving the field blank with "unknown".
    return {
      status:     'catch_all',
      confidence: 20,
      reason:     smtpResult.error
        ? `SMTP probe blocked (${smtpResult.error}) — domain has MX but specific address unverified`
        : 'SMTP probe timed out — domain has MX but specific address unverified',
    };
  }

  const code = smtpResult.code;

  if (!smtpResult.accepted) {
    // Permanent 5xx rejection
    if (code && code >= 500 && code < 600) {
      return {
        status:     'invalid',
        confidence: 90,
        reason:     `SMTP rejected with ${code}: ${smtpResult.message}`,
      };
    }
    // Temporary 4xx — could be greylisting, throttling etc.
    if (code && code >= 400 && code < 500) {
      return {
        status:     'unknown',
        confidence: 20,
        reason:     `SMTP temporary rejection (${code}): ${smtpResult.message} — try again later`,
      };
    }
    return {
      status:     'unknown',
      confidence: 15,
      reason:     `SMTP rejected (${code ?? 'unknown code'}): ${smtpResult.message}`,
    };
  }

  // SMTP accepted
  if (isCatchAll) {
    return {
      status:     'catch_all',
      confidence: 40,
      reason:     'Domain accepts all addresses — cannot confirm individual mailbox exists',
    };
  }

  return {
    status:     'valid',
    confidence: 85,
    reason:     `SMTP accepted RCPT TO (${code})`,
  };
}

module.exports = { scoreVerification };

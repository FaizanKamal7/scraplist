'use strict';

const express    = require('express');
const router     = express.Router();
const { RateLimiterMemory } = require('rate-limiter-flexible');

const { checkMXRecords }    = require('../services/dnsMxChecker');
const { smtpVerifyEmail }   = require('../services/smtpVerifier');
const { isCatchAllDomain }  = require('../services/catchAllDetector');
const { scoreVerification } = require('../services/verificationScorer');
const cache                 = require('../services/verificationCache');

// Shared module — works in Node via require() here
const { isValidEmailSyntax }   = require('../../emailSyntaxValidator');
const { generateEmailPatterns } = require('../../emailPatternGenerator');

// ── Rate limiters ──────────────────────────────────────────────────────────────

const perIpLimiter = new RateLimiterMemory({
  points:   parseInt(process.env.RATE_LIMIT_PER_IP_PER_MINUTE, 10) || 20,
  duration: 60,
});

const perDomainLimiter = new RateLimiterMemory({
  points:   parseInt(process.env.RATE_LIMIT_PER_DOMAIN_PER_HOUR, 10) || 60,
  duration: 3600,
});

// ── POST /api/email-verifier/verify ───────────────────────────────────────────

router.post('/verify', async (req, res) => {
  // Rate-limit by IP
  const ip = req.ip || '0.0.0.0';
  try {
    await perIpLimiter.consume(ip);
  } catch (_) {
    return res.status(429).json({ error: 'Too many requests from this IP. Wait a minute.' });
  }

  const {
    lead_id,
    first_name    = '',
    last_name     = '',
    company_domain = '',
    linkedin_url  = '',
    candidate_emails = [],
  } = req.body || {};

  // ── Resolve candidate list ─────────────────────────────────────────────────
  // Use provided candidate_emails if given; otherwise generate from name+domain
  let candidates = Array.isArray(candidate_emails) ? candidate_emails : [];

  if (candidates.length === 0 && first_name && last_name && company_domain) {
    candidates = generateEmailPatterns(first_name, last_name, company_domain)
      .map(c => c.email);
  }

  // Syntax filter
  candidates = candidates.filter(e => isValidEmailSyntax(e));

  if (candidates.length === 0) {
    return res.json({
      best_email:  null,
      status:      'invalid_format',
      confidence:  0,
      reason:      'No valid candidate email addresses to verify',
      mx_host:     null,
      is_catch_all: false,
      checked_at:  new Date().toISOString(),
      from_cache:  false,
      lead_id:     lead_id || null,
    });
  }

  // ── Determine domain ───────────────────────────────────────────────────────
  const domain = company_domain || candidates[0].split('@')[1];

  // Rate-limit by domain
  try {
    await perDomainLimiter.consume(domain);
  } catch (_) {
    return res.status(429).json({ error: `Too many verifications for domain "${domain}" this hour.` });
  }

  // ── DNS MX check — with parallel TLD fallback discovery ───────────────────
  // When the guessed domain (always .com) has no MX, try other common TLDs
  // simultaneously so we find the real company domain fast.
  const TLD_VARIANTS = ['.net', '.co', '.org', '.io', '.ca', '.co.uk', '.com.au'];

  const baseName = domain.includes('.')
    ? domain.slice(0, domain.lastIndexOf('.'))
    : domain;

  // Check guessed domain + all TLD variants in parallel
  const allVariants = [domain, ...TLD_VARIANTS.map(t => baseName + t)];
  const mxResults = await Promise.all(
    allVariants.map(d => checkMXRecords(d).then(r => ({ domain: d, ...r })))
  );

  const mxMatch      = mxResults.find(r => r.hasMX);
  const resolvedDomain = mxMatch ? mxMatch.domain : domain;
  const hasMX          = !!mxMatch;
  const mx_host        = mxMatch ? mxMatch.mx_host : null;

  // If a different TLD has MX, regenerate candidate emails for that domain
  if (hasMX && resolvedDomain !== domain && first_name && last_name) {
    candidates = generateEmailPatterns(first_name, last_name, resolvedDomain)
      .map(c => c.email)
      .filter(e => isValidEmailSyntax(e));
  }

  if (!hasMX) {
    const triedTlds = allVariants.map(d => d.split('.').slice(1).join('.')).join(', ');
    return res.json({
      best_email:      candidates[0],
      status:          'no_mx',
      confidence:      0,
      reason:          `No MX records found on any TLD tried (${triedTlds})`,
      mx_host:         null,
      is_catch_all:    false,
      resolved_domain: null,
      checked_at:      new Date().toISOString(),
      from_cache:      false,
      lead_id:         lead_id || null,
    });
  }

  // ── Catch-all detection ────────────────────────────────────────────────────
  const catchAll = await isCatchAllDomain(mx_host, resolvedDomain);

  // ── Verify candidates (stop at first SMTP acceptance) ─────────────────────
  let bestEmail  = candidates[0]; // default to first if all fail
  let bestResult = null;
  let fromCache  = false;

  for (const email of candidates) {
    // Check cache first
    if (cache.has(email)) {
      const cached = cache.get(email);
      if (cached.status === 'valid' || cached.status === 'catch_all') {
        bestEmail  = email;
        bestResult = cached;
        fromCache  = true;
        break;
      }
      continue; // skip previously confirmed invalid addresses
    }

    const smtpResult = await smtpVerifyEmail(mx_host, email);
    const scored     = scoreVerification({ smtpResult, isCatchAll: catchAll, hasMX: true, syntaxValid: true });

    cache.set(email, {
      ...scored,
      mx_host,
      is_catch_all: catchAll,
      checked_at:   new Date().toISOString(),
    });

    if (smtpResult.accepted) {
      bestEmail  = email;
      bestResult = scored;
      break;
    }

    // Keep track of best non-accepted result for the response
    if (!bestResult) bestResult = scored;
  }

  // If no cached hit and no SMTP acceptance, bestResult may be from the last candidate
  if (!bestResult) {
    bestResult = scoreVerification({ smtpResult: null, isCatchAll: catchAll, hasMX, syntaxValid: true });
  }

  return res.json({
    best_email:      bestEmail,
    status:          bestResult.status,
    confidence:      bestResult.confidence,
    reason:          bestResult.reason,
    mx_host,
    is_catch_all:    catchAll,
    resolved_domain: resolvedDomain !== domain ? resolvedDomain : null,
    checked_at:      new Date().toISOString(),
    from_cache:      fromCache,
    lead_id:         lead_id || null,
  });
});

module.exports = router;

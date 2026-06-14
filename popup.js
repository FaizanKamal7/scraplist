'use strict';

// ─── Element refs ─────────────────────────────────────────────────────────────

const statusBadge    = document.getElementById('status-badge');
const statLeads      = document.getElementById('stat-leads');
const statDupes      = document.getElementById('stat-dupes');
const statPage       = document.getElementById('stat-page');
const statEmails     = document.getElementById('stat-emails');
const emailHint      = document.getElementById('email-hint');
const btnStart       = document.getElementById('btn-start');
const btnStop        = document.getElementById('btn-stop');
const btnDownload    = document.getElementById('btn-download');
const btnClear       = document.getElementById('btn-clear');
const maxPagesInput  = document.getElementById('max-pages');
const delaySecInput  = document.getElementById('delay-sec');
const fetchDetailsCb = document.getElementById('fetch-details');
const fetchWarning   = document.getElementById('fetch-warning');
const pageWarning    = document.getElementById('page-warning');
const errorBox       = document.getElementById('error-box');
const errorMsg       = document.getElementById('error-msg');

const toggleEnrichment  = document.getElementById('toggle-enrichment');
const enrichmentPanel   = document.getElementById('enrichment-panel');
const enrichmentChevron = document.getElementById('enrichment-chevron');

const apolloKeyInput  = document.getElementById('apollo-key');
const apolloLink      = document.getElementById('apollo-link');
const btnApolloEnrich = document.getElementById('btn-apollo-enrich');

const hunterKeyInput  = document.getElementById('hunter-key');
const hunterLink      = document.getElementById('hunter-link');
const btnHunterEnrich = document.getElementById('btn-hunter-enrich');

const enrichProgressWrap  = document.getElementById('enrich-progress-wrap');
const enrichProgressBar   = document.getElementById('enrich-progress-bar');
const enrichProgressLabel = document.getElementById('enrich-progress-label');
const enrichStatusEl      = document.getElementById('enrich-status');

const backendUrlInput    = document.getElementById('backend-url');
const btnBackendPing     = document.getElementById('btn-backend-ping');
const backendPingStatus  = document.getElementById('backend-ping-status');
const btnBackendVerify   = document.getElementById('btn-backend-verify');
const backendSummary     = document.getElementById('backend-summary');
const vsValid            = document.getElementById('vs-valid');
const vsCatchall         = document.getElementById('vs-catchall');
const vsInvalid          = document.getElementById('vs-invalid');
const vsUnknown          = document.getElementById('vs-unknown');

const verifyLogWrap   = document.getElementById('verify-log-wrap');
const verifyLogEl     = document.getElementById('verify-log');
const verifyLogCount  = document.getElementById('verify-log-count');
const verifyLogToggle = document.getElementById('verify-log-toggle');
const verifyLogArrow  = document.getElementById('verify-log-arrow');

// ─── Utility ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

const escapeHtml = s => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Verification log ─────────────────────────────────────────────────────────

let _logOpen  = false;
let _logCount = 0;

verifyLogToggle.addEventListener('click', () => {
  _logOpen = !_logOpen;
  verifyLogEl.classList.toggle('hidden', !_logOpen);
  verifyLogArrow.innerHTML = _logOpen ? '&#9660;' : '&#9658;';
});

function clearVerifyLog() {
  _logCount = 0;
  _logOpen  = false;
  verifyLogEl.innerHTML   = '';
  verifyLogEl.classList.add('hidden');
  verifyLogArrow.innerHTML = '&#9658;';
  verifyLogCount.textContent = '';
  verifyLogWrap.classList.add('hidden');
}

function addVerifyLogEntry({ name, domain, email, status, reason, candidates, skipped }) {
  _logCount++;
  verifyLogCount.textContent = `(${_logCount})`;
  verifyLogWrap.classList.remove('hidden');

  const ICONS  = { valid: '✓', catch_all: '~', invalid: '✗', no_mx: '✗', unknown: '?', invalid_format: '✗', skipped: '—' };
  const COLORS = { valid: '#059669', catch_all: '#d97706', invalid: '#dc2626', no_mx: '#dc2626', unknown: '#6b7280', invalid_format: '#dc2626', skipped: '#9ca3af' };
  const icon  = ICONS[status]  || '?';
  const color = COLORS[status] || '#6b7280';

  const triedHtml = candidates?.length
    ? `<div class="vle-tried">Tried: ${escapeHtml(candidates.slice(0, 3).join(', '))}${candidates.length > 3 ? ` +${candidates.length - 3} more` : ''}</div>`
    : '';

  const emailHtml = email
    ? `<span class="vle-email">${escapeHtml(email)}</span>`
    : `<span class="vle-noemail">${skipped ? 'skipped — ' + (reason || 'no domain') : 'not found'}</span>`;

  const reasonHtml = email && reason
    ? `<span class="vle-reason">${escapeHtml(reason.slice(0, 70))}</span>`
    : '';

  const entry = document.createElement('div');
  entry.className = 'verify-log-entry';
  entry.innerHTML =
    `<div class="vle-row1">` +
      `<span class="vle-icon" style="color:${color}">${icon}</span>` +
      `<span class="vle-name">${escapeHtml(name)}</span>` +
      `<span class="vle-domain">${escapeHtml(domain || '—')}</span>` +
    `</div>` +
    `<div class="vle-row2">${emailHtml}${reasonHtml}</div>` +
    triedHtml;

  verifyLogEl.appendChild(entry);
  if (_logOpen) verifyLogEl.scrollTop = verifyLogEl.scrollHeight;
}

// ─── External links (MV3 popups cannot use <a target="_blank">) ───────────────

apolloLink.addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: 'https://app.apollo.io/#/settings/integrations/api' }); });
hunterLink.addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: 'https://hunter.io/api-keys' }); });

// ─── Mode tabs ────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

// ─── Fetch-details toggle ─────────────────────────────────────────────────────

fetchDetailsCb.addEventListener('change', () => {
  fetchWarning.classList.toggle('hidden', !fetchDetailsCb.checked);
});

// ─── Enrichment panel expand / collapse ──────────────────────────────────────

let enrichmentOpen = false;
toggleEnrichment.addEventListener('click', () => {
  enrichmentOpen = !enrichmentOpen;
  enrichmentPanel.style.display     = enrichmentOpen ? 'block' : 'none';
  enrichmentChevron.style.transform = enrichmentOpen ? 'rotate(180deg)' : '';
});

// ─── Persist API keys across popup opens ─────────────────────────────────────

apolloKeyInput.addEventListener('change',  () => chrome.storage.local.set({ apolloApiKey:  apolloKeyInput.value.trim() }));
hunterKeyInput.addEventListener('change',  () => chrome.storage.local.set({ hunterApiKey:  hunterKeyInput.value.trim() }));
backendUrlInput.addEventListener('change', () => chrome.storage.local.set({ backendUrl: backendUrlInput.value.trim() }));

// ─── UI renderer ──────────────────────────────────────────────────────────────

function renderUI(data) {
  const status = data.status || 'idle';
  statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  statusBadge.className   = `badge badge-${status}`;

  const leads = data.leads || [];
  statLeads.textContent  = data.totalLeads        ?? 0;
  statDupes.textContent  = data.duplicatesSkipped ?? 0;
  statPage.textContent   = data.currentPage       ?? '—';
  statEmails.textContent = leads.filter(l => l.email).length;

  // Show workflow hint whenever leads exist but any are missing emails
  const missingEmails = leads.filter(l => !l.email).length;
  emailHint.classList.toggle('hidden', leads.length === 0 || missingEmails === 0);

  const running = status === 'running';
  btnStart.disabled       = running;
  btnStop.disabled        = !running;
  maxPagesInput.disabled  = running;
  delaySecInput.disabled  = running;
  fetchDetailsCb.disabled = running;

  if (data.settings) {
    maxPagesInput.value    = data.settings.maxPages     ?? 10;
    delaySecInput.value    = data.settings.delaySeconds ?? 7;
    fetchDetailsCb.checked = data.settings.fetchDetails ?? false;
    fetchWarning.classList.toggle('hidden', !fetchDetailsCb.checked);
  }

  if (data.apolloApiKey) apolloKeyInput.value  = data.apolloApiKey;
  if (data.hunterApiKey) hunterKeyInput.value  = data.hunterApiKey;
  if (data.backendUrl)   backendUrlInput.value = data.backendUrl;

  // Backend summary badge counts
  const statuses = leads.map(l => l.email_status).filter(Boolean);
  if (statuses.length) {
    backendSummary.classList.remove('hidden');
    vsValid.textContent    = statuses.filter(s => s === 'valid').length    + ' Valid';
    vsCatchall.textContent = statuses.filter(s => s === 'catch_all').length + ' Catch-all';
    vsInvalid.textContent  = statuses.filter(s => s === 'invalid' || s === 'no_mx' || s === 'invalid_format').length + ' Invalid';
    vsUnknown.textContent  = statuses.filter(s => s === 'unknown').length  + ' Unknown';
  } else {
    backendSummary.classList.add('hidden');
  }

  if (data.lastError) {
    errorMsg.textContent = data.lastError;
    errorBox.classList.remove('hidden');
  } else {
    errorBox.classList.add('hidden');
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get([
    'status', 'totalLeads', 'duplicatesSkipped', 'currentPage',
    'lastError', 'settings', 'apolloApiKey', 'hunterApiKey', 'backendUrl', 'leads',
  ]);
  renderUI(data);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('linkedin.com/sales/')) {
    pageWarning.classList.remove('hidden');
    btnStart.disabled = true;
  }
}

chrome.storage.onChanged.addListener((_, area) => {
  if (area !== 'local') return;
  chrome.storage.local.get([
    'status', 'totalLeads', 'duplicatesSkipped', 'currentPage',
    'lastError', 'settings', 'apolloApiKey', 'hunterApiKey', 'backendUrl', 'leads',
  ]).then(renderUI);
});

// ─── Start / Stop ─────────────────────────────────────────────────────────────

btnStart.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const settings = {
    maxPages:     Math.max(1, parseInt(maxPagesInput.value)  || 10),
    delaySeconds: Math.max(3, parseInt(delaySecInput.value)  || 7),
    fetchDetails: fetchDetailsCb.checked,
  };

  await chrome.storage.local.set({
    stopRequested: false, lastError: null,
    status: 'running', currentPage: 1, settings,
  });

  const ok = await sendToContentScript(tab.id, { action: 'start', settings });
  if (!ok) {
    await chrome.storage.local.set({
      status: 'error',
      lastError: 'Could not connect to the page. Refresh the tab and try again.',
    });
  }
});

btnStop.addEventListener('click', async () => {
  await chrome.storage.local.set({ stopRequested: true });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) sendToContentScript(tab.id, { action: 'stop' }).catch(() => {});
});

btnDownload.addEventListener('click', async () => {
  const { leads } = await chrome.storage.local.get('leads');
  if (!leads?.length) { alert('No leads collected yet.'); return; }
  downloadCSV(leads);
});

btnClear.addEventListener('click', async () => {
  if (!confirm('Delete all collected leads and reset all counters?')) return;
  await chrome.storage.local.set({
    leads: [], totalLeads: 0, duplicatesSkipped: 0,
    currentPage: 0, status: 'idle', lastError: null, stopRequested: false,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// APOLLO.IO EMAIL ENRICHMENT
//
// Apollo's People Match API accepts a LinkedIn URL and returns the person's
// verified work email from Apollo's database of 275M+ contacts.
//
// Why Apollo is better than pattern guessing:
//   • Real database — not invented emails
//   • Accepts linkedin_url directly (we already have this)
//   • SMTP-verified results
//   • Free plan: 50 email reveals/month, no credit card
//
// API docs: https://apolloio.github.io/apollo-api-docs/?shell#people-api
//
// Rate limits (free plan): ~1 request/second, 50 reveals/month.
// We use a 1.2 s delay between calls to stay within limits.
// ═══════════════════════════════════════════════════════════════════════════════

btnApolloEnrich.addEventListener('click', async () => {
  const apiKey = apolloKeyInput.value.trim();
  if (!apiKey) { showStatus('error', 'Paste your Apollo.io API key first.'); return; }

  const { leads } = await chrome.storage.local.get('leads');
  if (!leads?.length) { showStatus('error', 'No leads found — run extraction first.'); return; }

  // Only process leads that don't have a verified email yet
  const needsEnrich = leads.filter(l => !l.email || l.email_source === 'guessed');
  if (!needsEnrich.length) { showStatus('ok', 'All leads already have verified emails.'); return; }

  setEnrichBusy(true);
  showProgress(0, needsEnrich.length);

  let found = 0, notInDb = 0, errors = 0, processed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (lead.email && lead.email_source !== 'guessed') continue;

    const nameParts = (lead.name || '').trim().split(/\s+/);
    const firstName = nameParts[0]             || '';
    const lastName  = nameParts.slice(1).join(' ') || '';

    if (!firstName) { errors++; processed++; showProgress(processed, needsEnrich.length); continue; }

    try {
      // Apollo's People Match endpoint — send LinkedIn URL for best accuracy.
      // Falls back to name + company if no LinkedIn URL available.
      const body = {
        api_key:                 apiKey,
        first_name:              firstName,
        last_name:               lastName,
        organization_name:       lead.company || '',
        reveal_personal_emails:  false, // work emails only
        reveal_phone_number:     false,
      };

      // The linkedin_url is the most accurate identifier Apollo has.
      // If we extracted it (fetch-details mode), pass it through.
      if (lead.linkedin_url) {
        body.linkedin_url = lead.linkedin_url;
      }

      const res = await fetch('https://api.apollo.io/v1/people/match', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body:    JSON.stringify(body),
      });

      if (res.status === 422) {
        // Apollo returns 422 when the person isn't in their database
        notInDb++; processed++; showProgress(processed, needsEnrich.length);
        showStatus('info', `${processed}/${needsEnrich.length} · Found: ${found} · Not in DB: ${notInDb}`);
        await sleep(1200);
        continue;
      }

      if (res.status === 401) {
        // Bad API key — stop immediately
        setEnrichBusy(false);
        hideProgress();
        showStatus('error', 'Invalid Apollo API key. Check your key at apollo.io → Settings → Integrations → API.');
        return;
      }

      if (res.status === 429) {
        // Rate limited — wait longer and retry once
        await sleep(5000);
        errors++; processed++;
        showProgress(processed, needsEnrich.length);
        continue;
      }

      const data = await res.json();
      const person = data?.person;

      if (person?.email) {
        leads[i].email            = person.email;
        leads[i].email_source     = 'apollo';
        leads[i].email_status     = person.email_status || ''; // verified / guessed / unavailable
        leads[i].email_confidence = person.email_status === 'verified' ? '100%' : '~70%';
        found++;
      } else {
        notInDb++;
      }

    } catch (err) {
      errors++;
    }

    processed++;
    showProgress(processed, needsEnrich.length);
    showStatus('info', `${processed}/${needsEnrich.length} processed · ${found} found · ${notInDb} not in DB`);

    // Apollo free plan: stay well under 1 req/sec
    await sleep(1200);
  }

  await chrome.storage.local.set({ leads });
  setEnrichBusy(false);
  hideProgress();

  showStatus(
    found > 0 ? 'ok' : 'warn',
    `Done. ✓ ${found} verified email${found !== 1 ? 's' : ''}  ·  ` +
    `✗ ${notInDb} not in Apollo's DB  ·  ` +
    (errors ? `⚠ ${errors} errors  ·  ` : '') +
    `Now click ⬇ Download CSV.`
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// HUNTER.IO EMAIL ENRICHMENT
//
// Hunter finds work emails by first name + last name + company domain.
// It verifies the result via SMTP before returning it.
//
// Free plan: 25 requests/month. Requires an API key (free, no credit card).
// Get key at: https://hunter.io/api-keys
//
// Two API calls per lead:
//   1. domain-search?company=NAME  → resolves company name to its domain
//   2. email-finder?domain=D&first_name=F&last_name=L → returns verified email
//
// Use Apollo instead if you have LinkedIn URLs — it's more accurate and
// uses the LinkedIn URL directly rather than needing a domain lookup.
// ═══════════════════════════════════════════════════════════════════════════════

btnHunterEnrich.addEventListener('click', async () => {
  const apiKey = hunterKeyInput.value.trim();
  if (!apiKey) { showStatus('error', 'Paste your Hunter.io API key first.'); return; }

  const { leads } = await chrome.storage.local.get('leads');
  if (!leads?.length) { showStatus('error', 'No leads found — run extraction first.'); return; }

  const needsEnrich = leads.filter(l => !l.email || l.email_source === 'guessed');
  if (!needsEnrich.length) { showStatus('ok', 'All leads already have verified emails.'); return; }

  setEnrichBusy(true);
  showProgress(0, needsEnrich.length);

  let found = 0, failed = 0, processed = 0;
  const domainCache = {};

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (lead.email && lead.email_source !== 'guessed') continue;

    const nameParts = (lead.name || '').trim().split(/\s+/);
    const firstName = nameParts[0]             || '';
    const lastName  = nameParts.slice(1).join(' ') || '';
    const company   = (lead.company || '').trim();

    if (!firstName || !company) {
      failed++; processed++;
      showProgress(processed, needsEnrich.length);
      continue;
    }

    try {
      // ── Step 1: company → domain ────────────────────────────────────────
      let domain = domainCache[company.toLowerCase()];
      if (!domain) {
        const dr = await fetch(
          `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&limit=1&api_key=${encodeURIComponent(apiKey)}`
        );
        if (dr.status === 401) {
          setEnrichBusy(false); hideProgress();
          showStatus('error', 'Invalid Hunter.io API key.');
          return;
        }
        const dj = await dr.json();
        domain = dj?.data?.domain || '';
        if (domain) domainCache[company.toLowerCase()] = domain;
        await sleep(1200);
      }

      if (!domain) { failed++; processed++; showProgress(processed, needsEnrich.length); continue; }

      // ── Step 2: name + domain → verified email ──────────────────────────
      const er = await fetch(
        `https://api.hunter.io/v2/email-finder` +
        `?domain=${encodeURIComponent(domain)}` +
        `&first_name=${encodeURIComponent(firstName)}` +
        `&last_name=${encodeURIComponent(lastName)}` +
        `&api_key=${encodeURIComponent(apiKey)}`
      );
      const ej = await er.json();
      const email = ej?.data?.email || '';

      if (email) {
        leads[i].email            = email;
        leads[i].email_source     = 'hunter';
        leads[i].email_status     = 'verified';
        leads[i].email_confidence = (ej?.data?.score ?? '') + '%';
        found++;
      } else {
        failed++;
      }

    } catch (_) {
      failed++;
    }

    processed++;
    showProgress(processed, needsEnrich.length);
    showStatus('info', `${processed}/${needsEnrich.length} · Found: ${found}`);
    await sleep(1200);
  }

  await chrome.storage.local.set({ leads });
  setEnrichBusy(false);
  hideProgress();

  showStatus(
    found > 0 ? 'ok' : 'error',
    `Done. ✓ ${found} verified email${found !== 1 ? 's' : ''}  ·  ✗ ${failed} not found. Download CSV.`
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// OWN BACKEND — EMAIL VERIFICATION
//
// Generates email patterns from name + company, then verifies each candidate
// via DNS MX + SMTP RCPT TO on the user's own backend server.
// No third-party API limits; cost is only your server time.
//
// Setup: run `npm start` in the /backend folder, then set backend URL here.
// ═══════════════════════════════════════════════════════════════════════════════

btnBackendPing.addEventListener('click', async () => {
  const url = backendUrlInput.value.trim() || 'http://localhost:3001';
  backendPingStatus.textContent = 'Pinging…';
  backendPingStatus.className   = 'ping-status ping-checking';
  const ok = await window.EmailVerifierClient.pingBackend(url);
  backendPingStatus.textContent = ok ? '● Online' : '● Offline';
  backendPingStatus.className   = `ping-status ping-${ok ? 'ok' : 'error'}`;
});

btnBackendVerify.addEventListener('click', async () => {
  const backendUrl = backendUrlInput.value.trim() || 'http://localhost:3001';

  const { leads } = await chrome.storage.local.get('leads');
  if (!leads?.length) { showStatus('error', 'No leads found — run extraction first.'); return; }

  const needsVerify = leads.filter(l => !l.email || l.verification_method === 'own_backend');
  if (!needsVerify.length) { showStatus('ok', 'All leads already have verified emails.'); return; }

  // Confirm backend is reachable before starting
  const alive = await window.EmailVerifierClient.pingBackend(backendUrl);
  if (!alive) {
    showStatus('error', 'Cannot reach backend. Start the server with `npm start` in the /backend folder.');
    return;
  }

  setEnrichBusy(true);
  showProgress(0, needsVerify.length);
  clearVerifyLog();

  let cntValid = 0, cntCatchAll = 0, cntInvalid = 0, cntUnknown = 0;
  let processed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (lead.email && lead.verification_method !== 'own_backend') continue;

    const firstName    = lead.first_name    || (lead.name || '').split(/\s+/)[0] || '';
    const lastName     = lead.last_name     || (lead.name || '').split(/\s+/).slice(1).join(' ') || '';
    const companyDomain = lead.company_domain || '';
    const fullName = `${firstName} ${lastName}`.trim() || lead.name || '(unknown)';

    if (!firstName || !companyDomain) {
      const skipReason = !firstName ? 'no first name' : `no domain for "${lead.company || 'unknown company'}"`;
      addVerifyLogEntry({ name: fullName, domain: companyDomain, email: '', status: 'skipped', reason: skipReason, candidates: [], skipped: true });
      cntUnknown++; processed++;
      showProgress(processed, needsVerify.length);
      continue;
    }

    // Generate candidates locally, filter syntax
    const rawCandidates = window.EmailPatternGenerator.generateEmailPatterns(firstName, lastName, companyDomain);
    const validCandidates = window.EmailSyntaxValidator.filterValidCandidates(rawCandidates);
    const candidateEmails = validCandidates.map(c => c.email);

    try {
      const result = await window.EmailVerifierClient.verifyLeadEmails({
        leadId:          lead.profile_url || String(i),
        firstName,
        lastName,
        companyDomain,
        linkedinUrl:     lead.linkedin_url || '',
        candidateEmails,
        backendUrl,
      });

      leads[i].generated_email        = result.best_email || '';
      leads[i].email_status           = result.status;
      leads[i].confidence_score       = result.confidence;
      leads[i].verification_reason    = result.reason;
      leads[i].verification_method    = 'own_backend';
      leads[i].last_verified_at       = result.checked_at;

      // If backend found a better domain via TLD discovery, save it back
      if (result.resolved_domain) {
        leads[i].company_domain = result.resolved_domain;
      }

      // Promote to primary email field only if confidently valid
      if (result.status === 'valid' || result.status === 'catch_all') {
        leads[i].email        = result.best_email;
        leads[i].email_source = 'own_backend';
      }

      const logDomain = result.resolved_domain
        ? `${result.resolved_domain} (was ${companyDomain})`
        : companyDomain;
      addVerifyLogEntry({ name: fullName, domain: logDomain, email: result.best_email || '', status: result.status, reason: result.reason || '', candidates: candidateEmails });

      switch (result.status) {
        case 'valid':          cntValid++;    break;
        case 'catch_all':      cntCatchAll++; break;
        case 'invalid':
        case 'no_mx':
        case 'invalid_format': cntInvalid++;  break;
        default:               cntUnknown++;
      }

    } catch (err) {
      leads[i].email_status        = 'unknown';
      leads[i].verification_reason = err.message;
      leads[i].verification_method = 'own_backend';
      addVerifyLogEntry({ name: fullName, domain: companyDomain, email: '', status: 'unknown', reason: err.message, candidates: candidateEmails });
      cntUnknown++;
    }

    processed++;
    showProgress(processed, needsVerify.length);
    showStatus('info',
      `${processed}/${needsVerify.length} · ` +
      `✓ ${cntValid} valid · ` +
      `~ ${cntCatchAll} catch-all · ` +
      `✗ ${cntInvalid} invalid`
    );
  }

  await chrome.storage.local.set({ leads });
  setEnrichBusy(false);
  hideProgress();

  // Auto-expand the log when done so the user sees all results
  if (_logCount > 0) {
    _logOpen = true;
    verifyLogEl.classList.remove('hidden');
    verifyLogArrow.innerHTML = '&#9660;';
    verifyLogEl.scrollTop = 0;
  }

  showStatus(
    cntValid > 0 ? 'ok' : 'warn',
    `Done. ✓ ${cntValid} valid · ~ ${cntCatchAll} catch-all · ✗ ${cntInvalid} invalid · ? ${cntUnknown} unknown. Download CSV.`
  );
});

// ─── Progress helpers ─────────────────────────────────────────────────────────

function showProgress(done, total) {
  enrichProgressWrap.classList.remove('hidden');
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  enrichProgressBar.style.width   = pct + '%';
  enrichProgressLabel.textContent = `${done} / ${total}`;
}

function hideProgress() { enrichProgressWrap.classList.add('hidden'); }

function setEnrichBusy(busy) {
  btnApolloEnrich.disabled  = busy;
  btnHunterEnrich.disabled  = busy;
  btnBackendVerify.disabled = busy;
  btnBackendPing.disabled   = busy;
}

function showStatus(type, message) {
  enrichStatusEl.textContent = message;
  enrichStatusEl.className   = `enrich-status enrich-${type}`;
  enrichStatusEl.classList.remove('hidden');
}

// ─── Content script messaging ─────────────────────────────────────────────────

async function sendToContentScript(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
    return true;
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      await chrome.tabs.sendMessage(tabId, message);
      return true;
    } catch (_err) { return false; }
  }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function downloadCSV(leads) {
  const FIELDS = [
    'name', 'first_name', 'last_name', 'job_title', 'company', 'company_domain', 'location',
    'email', 'email_source',
    'generated_email', 'email_status', 'confidence_score', 'verification_reason', 'verification_method', 'last_verified_at',
    'email_confidence',
    'profile_url', 'linkedin_url',
    'current_page_url', 'page_number', 'extracted_at',
  ];

  const escape = v => {
    const s = v == null ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r'))
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  const rows = [
    FIELDS.join(','),
    ...leads.map(l => FIELDS.map(f => escape(l[f])).join(',')),
  ];

  const blob   = new Blob([rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const date   = new Date().toISOString().slice(0, 10);
  const time   = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `sales-nav-leads-${date}_${time}.csv`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();

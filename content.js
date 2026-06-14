'use strict';

// Guard against duplicate injection
if (window.__salesNavExporterLoaded) {
  chrome.runtime.onMessage.addListener(function echo(msg, _s, respond) {
    if (msg.action === 'start' || msg.action === 'stop') respond({ ok: true, already: true });
  });
} else {
  window.__salesNavExporterLoaded = true;
  initExporter();
}

function initExporter() {

  let stopFlag       = false;
  let extractionBusy = false;

  // ── Message listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'start') {
      if (extractionBusy) { sendResponse({ ok: false, reason: 'already running' }); return; }
      stopFlag       = false;
      extractionBusy = true;
      sendResponse({ ok: true });
      startExtraction(msg.settings)
        .catch(err => chrome.storage.local.set({ status: 'error', lastError: err.message }))
        .finally(() => { extractionBusy = false; });
      return false;
    }
    if (msg.action === 'stop') { stopFlag = true; sendResponse({ ok: true }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTORS
  //
  // LinkedIn changes its DOM frequently. If extraction breaks, open DevTools
  // on a Sales Navigator results page, inspect the elements, and update the
  // arrays below. Each array is tried top-to-bottom; first match wins.
  // ═══════════════════════════════════════════════════════════════════════════

  const SEL = {

    resultItems: [
      '[data-view-name="search-results-lead-card"]',
      '.search-results__result-list > li',
      '.artdeco-list > li.artdeco-list__item',
      '[data-chameleon-result-urn]',
    ],

    name: [
      '[data-anonymize="person-name"]',
      '.artdeco-entity-lockup__title a span',
      '.artdeco-entity-lockup__title a',
      '.result-lockup__name a',
      'a[data-control-name="view_lead_panel_via_search_lead_name"]',
    ],

    jobTitle: [
      '[data-anonymize="title"]',
      '.artdeco-entity-lockup__subtitle span',
      '.artdeco-entity-lockup__subtitle',
      '.result-lockup__title',
    ],

    company: [
      '[data-anonymize="company-name"]',
      '.artdeco-entity-lockup__caption a',
      '.artdeco-entity-lockup__caption',
      'a[data-control-name="view_lead_panel_via_search_company_name"]',
    ],

    location: [
      '[data-anonymize="location"]',
      '.artdeco-entity-lockup__metadata li:first-child',
      '.result-lockup__misc-item:last-child',
    ],

    // The Sales Navigator profile URL on each card
    profileLink: [
      'a[href*="/sales/lead/"]',
      'a[href*="/sales/people/"]',
      '.artdeco-entity-lockup__title a[href]',
      '.result-lockup__name a[href]',
    ],

    // The element to CLICK to open the slide-in profile panel
    panelTrigger: [
      'a[data-control-name="view_lead_panel_via_search_lead_name"]',
      '[data-anonymize="person-name"] a',
      '.artdeco-entity-lockup__title a[href]',
      '.result-lockup__name a[href]',
      'a[href*="/sales/lead/"]',
    ],

    // Panel dismiss button (tried in order)
    closePanel: [
      'button[aria-label="Dismiss"]',
      'button[aria-label="Close"]',
      'button[data-test-modal-close-btn]',
      '.artdeco-modal__dismiss',
      '.artdeco-dismiss',
    ],

    resultsWrapper: [
      '.search-results__result-list',
      '[data-view-name="search-results"]',
      '.artdeco-list',
    ],
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  function firstMatch(root, selList) {
    for (const s of selList) {
      try { const el = root.querySelector(s); if (el) return el; } catch (_) {}
    }
    return null;
  }

  function allMatches(root, selList) {
    for (const s of selList) {
      try { const els = root.querySelectorAll(s); if (els.length) return [...els]; } catch (_) {}
    }
    return [];
  }

  function getText(el) {
    return el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
  }

  function getCleanHref(el) {
    if (!el) return '';
    const raw = el.href || el.getAttribute('href') || '';
    try { const u = new URL(raw, location.origin); return u.origin + u.pathname; }
    catch (_) { return raw; }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CARD EXTRACTION (no clicking, reads visible DOM only)
  // ═══════════════════════════════════════════════════════════════════════════

  // Legal / generic suffixes to strip before guessing a domain.
  // Order matters: longer matches first.
  const COMPANY_STRIP_RE = /[\s,.]*(inc\.?|llc\.?|ltd\.?|limited|corp\.?|corporation|co\.?|gmbh|ag|sa|sas|srl|bv|nv|plc|pty|pvt|holding|holdings|group|solutions|services|technologies|technology|tech|systems|global|international|intl|consulting|ventures|partners|associates)\s*$/i;

  // LinkedIn placeholder values that don't map to a real company domain.
  const INVALID_COMPANY_RE = /^(various\s*(companies)?|self[- ]?employed|freelance(r)?|independent(\s+contractor)?|contractor|consultant(s)?|unemployed|retired|n\/?a|none|-+|\.)$/i;

  function guessCompanyDomain(companyName) {
    if (!companyName) return '';
    if (INVALID_COMPANY_RE.test(companyName.trim())) return '';
    let name = companyName.trim();
    // Strip trailing legal/generic suffixes repeatedly (e.g. "Acme Corp Ltd")
    let prev;
    do { prev = name; name = name.replace(COMPANY_STRIP_RE, '').trim(); } while (name !== prev);
    // Lowercase, strip punctuation except hyphens, collapse spaces → hyphen
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '');
    return slug ? `${slug}.com` : '';
  }

  function extractCardsFromPage(pageNumber) {
    const cards   = allMatches(document, SEL.resultItems);
    const pageUrl = location.href;
    const now     = new Date().toISOString();
    const results = [];

    for (const card of cards) {
      const name        = getText(firstMatch(card, SEL.name));
      const job_title   = getText(firstMatch(card, SEL.jobTitle));
      const company     = getText(firstMatch(card, SEL.company));
      const locationVal = getText(firstMatch(card, SEL.location));
      const profile_url = getCleanHref(firstMatch(card, SEL.profileLink));

      if (!name && !profile_url) continue; // skip skeleton/placeholder cards

      const nameParts    = name.trim().split(/\s+/);
      const first_name   = nameParts[0] || '';
      const last_name    = nameParts.slice(1).join(' ') || '';
      const company_domain = guessCompanyDomain(company);

      results.push({
        name, first_name, last_name,
        job_title, company, company_domain,
        location:         locationVal,
        email:            '',
        profile_url,
        linkedin_url:     '',
        current_page_url: pageUrl,
        page_number:      pageNumber,
        extracted_at:     now,
        _card:            card,  // temporary DOM ref, stripped before storage
      });
    }
    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE PANEL — LinkedIn URL via MutationObserver "diff" approach
  //
  // STRATEGY: instead of relying on panel container selectors (which break
  // whenever LinkedIn redesigns), we:
  //   1. Snapshot all linkedin.com/in/ and mailto: links currently on the page.
  //   2. Click the lead name to open the profile panel.
  //   3. Use a MutationObserver to watch for NEW links to appear.
  //   4. The first new linkedin.com/in/ link = the actual LinkedIn profile URL.
  //   5. The first new mailto: link = email (rare, subscription-dependent).
  //   6. Close the panel with Escape or a dismiss button.
  //
  // This approach is selector-agnostic and survives LinkedIn DOM redesigns.
  // ═══════════════════════════════════════════════════════════════════════════

  function snapshotHrefs(selector) {
    const set = new Set();
    document.querySelectorAll(selector).forEach(el => {
      if (el.href) set.add(el.href.split('?')[0]);
    });
    return set;
  }

  // Wait for a NEW href (not in existingSet) matching selector to appear.
  // Uses MutationObserver so it resolves the instant the link is injected —
  // no polling delay. Falls back to empty string on timeout.
  function awaitNewHref(existingSet, selector, timeoutMs) {
    return new Promise(resolve => {
      const check = () => {
        for (const el of document.querySelectorAll(selector)) {
          const href = el.href ? el.href.split('?')[0] : '';
          if (href && !existingSet.has(href)) return href;
        }
        return null;
      };

      // Check immediately (panel may already be open from a previous interaction)
      const immediate = check();
      if (immediate) { resolve(immediate); return; }

      const timer = setTimeout(() => { obs.disconnect(); resolve(''); }, timeoutMs);

      const obs = new MutationObserver(() => {
        const found = check();
        if (found) { obs.disconnect(); clearTimeout(timer); resolve(found); }
      });

      obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    });
  }

  async function closePanelIfOpen() {
    const btn = firstMatch(document, SEL.closePanel);
    if (btn) { btn.click(); await sleep(350); return; }
    // Fallback: Escape key — closes most modal/panel patterns
    document.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(350);
  }

  async function fetchProfileDetails(card) {
    const result = { linkedin_url: '', email: '' };

    const trigger = firstMatch(card, SEL.panelTrigger);
    if (!trigger) return result;

    // Snapshot what's already on the page before we click anything
    const existingLinkedIn = snapshotHrefs('a[href*="linkedin.com/in/"]');
    const existingMailto   = snapshotHrefs('a[href^="mailto:"]');

    // Close any panel already open (from a previous lead)
    await closePanelIfOpen();
    await sleep(200);

    // Click the lead name — Sales Nav intercepts and opens the slide-in panel
    trigger.click();

    // ── LinkedIn URL — resolves instantly via MutationObserver ───────────────
    // Timeout: 10 s (slow connections / heavy panels may take several seconds)
    const rawLinkedIn = await awaitNewHref(existingLinkedIn, 'a[href*="linkedin.com/in/"]', 10000);
    if (rawLinkedIn) result.linkedin_url = rawLinkedIn;

    // ── Email — give it a short additional window to render ──────────────────
    // LinkedIn only shows emails if the lead has shared them and your plan includes it.
    const rawMailto = await awaitNewHref(existingMailto, 'a[href^="mailto:"]', 2500);
    if (rawMailto) {
      result.email = rawMailto.replace('mailto:', '').split('?')[0].trim();
    } else {
      // Some plans show email as plain text with data-anonymize="email"
      const emailEl = document.querySelector('[data-anonymize="email"]');
      if (emailEl) {
        const t = getText(emailEl);
        if (t.includes('@')) result.email = t;
      }
    }

    await closePanelIfOpen();
    await sleep(400); // let the page settle before the next card click

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEDUPLICATION
  // ═══════════════════════════════════════════════════════════════════════════

  function dedupKey(lead) {
    if (lead.profile_url)  return lead.profile_url.toLowerCase();
    if (lead.linkedin_url) return lead.linkedin_url.toLowerCase();
    return [lead.name, lead.company, lead.job_title].join('|').toLowerCase().trim();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGINATION
  // ═══════════════════════════════════════════════════════════════════════════

  function findNextButton() {
    const selectors = [
      'button[aria-label="Next"]',
      '[data-test-pagination-page-btn="next"]',
      'button.artdeco-pagination__button--next',
      '.search-results__pagination-next-button button',
      'button[aria-label*="Next"]',
    ];
    for (const s of selectors) {
      try { const b = document.querySelector(s); if (b) return b; } catch (_) {}
    }
    return null;
  }

  function isClickable(btn) {
    if (!btn) return false;
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
    const st = getComputedStyle(btn);
    return st.display !== 'none' && st.visibility !== 'hidden';
  }

  function getPageFingerprint() {
    const wrapper = firstMatch(document, SEL.resultsWrapper);
    const cards   = allMatches(wrapper || document, SEL.resultItems).slice(0, 5);
    return cards.length
      ? cards.map(c => c.innerText.trim().slice(0, 120)).join('|||')
      : document.body.innerText.slice(0, 600);
  }

  async function waitForPageChange(oldPrint, timeoutMs = 35000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(900);
      const cur = getPageFingerprint();
      if (cur && cur !== oldPrint) { await sleep(2500); return true; }
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STORAGE / UTILS
  // ═══════════════════════════════════════════════════════════════════════════

  const setStorage = p  => chrome.storage.local.set(p);
  const getStorage = ks => chrome.storage.local.get(ks);
  const sleep      = ms => new Promise(r => setTimeout(r, ms));

  function sanitiseLead(lead) {
    const { _card, ...rest } = lead;
    return rest;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN EXTRACTION LOOP
  // ═══════════════════════════════════════════════════════════════════════════

  async function startExtraction(settings) {
    const maxPages     = Math.max(1, settings.maxPages     || 10);
    const delaySeconds = Math.max(3, settings.delaySeconds || 7);
    const fetchDetails = settings.fetchDetails || false;

    const stored = await getStorage(['leads', 'totalLeads', 'duplicatesSkipped']);
    let leads             = stored.leads             || [];
    let totalLeads        = stored.totalLeads        || 0;
    let duplicatesSkipped = stored.duplicatesSkipped || 0;
    const seen = new Set(leads.map(dedupKey));

    let pageNumber = 1;
    await setStorage({ status: 'running', currentPage: pageNumber });

    while (pageNumber <= maxPages) {

      if (stopFlag) break;
      const { stopRequested } = await getStorage(['stopRequested']);
      if (stopRequested) { stopFlag = true; break; }

      // ── Extract visible card fields ────────────────────────────────────────
      const cards = extractCardsFromPage(pageNumber);

      for (const lead of cards) {
        const key = dedupKey(lead);
        if (seen.has(key)) { duplicatesSkipped++; continue; }

        // ── Optionally open each profile panel for LinkedIn URL + email ───────
        if (fetchDetails) {
          if (stopFlag) break;
          const details = await fetchProfileDetails(lead._card);
          lead.linkedin_url = details.linkedin_url;
          lead.email        = details.email;
          // Brief pause between panel opens (looks human, avoids rate signals)
          await sleep(700 + Math.random() * 1000);
        }

        seen.add(key);
        leads.push(sanitiseLead(lead));
        totalLeads++;
      }

      await setStorage({ leads, totalLeads, duplicatesSkipped, currentPage: pageNumber });

      if (stopFlag) break;

      const nextBtn = findNextButton();
      if (!isClickable(nextBtn)) { await setStorage({ status: 'finished' }); return; }

      // Human-like inter-page delay
      await sleep(delaySeconds * 1000 + Math.random() * 3000);

      if (stopFlag) break;
      const { stopRequested: sr2 } = await getStorage(['stopRequested']);
      if (sr2) { stopFlag = true; break; }

      const oldPrint = getPageFingerprint();
      nextBtn.click();

      const changed = await waitForPageChange(oldPrint);
      if (!changed) {
        await setStorage({
          status: 'error',
          lastError: `Page ${pageNumber + 1} did not load in 35 s. Refresh and restart.`,
        });
        return;
      }

      pageNumber++;
      await setStorage({ currentPage: pageNumber });
    }

    await setStorage({ status: stopFlag ? 'stopped' : 'finished' });
  }

} // end initExporter

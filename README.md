# Sales Nav Exporter

A Chrome Extension (Manifest V3) that reads visible lead cards from LinkedIn Sales Navigator search result pages and exports them to CSV — entirely client-side, no backend, no login.

---

## File Structure

```
sales-nav-exporter/
├── manifest.json   — Chrome Extension manifest (MV3)
├── popup.html      — Extension popup UI
├── popup.js        — Popup logic (start / stop / export / clear)
├── content.js      — Lead extraction and pagination (runs in page)
├── styles.css      — Popup styles
└── README.md       — This file
```

---

## 1. How to Install

1. Download or clone this folder to your computer.
2. Open Chrome and navigate to **`chrome://extensions`**.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the `sales-nav-exporter` folder.
5. The "Sales Nav Exporter" icon will appear in your Chrome toolbar.  
   (Pin it via the puzzle-piece icon → pin button for quick access.)

---

## 2. How to Use

1. Log in to LinkedIn and open **Sales Navigator**.
2. Run a search and wait for the search results page to fully load.
3. Click the **Sales Nav Exporter** icon in the toolbar.
4. Configure your settings:
   - **Max pages** — how many result pages to extract (default: 10).
   - **Delay (sec)** — seconds to wait between pages (default: 7, minimum: 3).
5. Click **▶ Start**.

The extension will:
- Extract all visible lead cards on the current page.
- Wait the configured delay (plus up to 3 s of random jitter).
- Click the "Next" pagination button.
- Wait for new results to appear.
- Repeat until it reaches the max page limit, runs out of pages, or you click Stop.

Progress is shown live in the popup:

| Indicator | Meaning |
|---|---|
| **Leads** | Total unique leads collected so far |
| **Skipped** | Duplicates ignored (same profile URL or name+company+title) |
| **Page** | Current page being processed |
| **Status badge** | Idle / Running / Stopped / Finished / Error |

---

## 3. How to Stop Extraction

Click the **⏸ Stop** button at any time.  
The extraction will finish the current in-progress wait and then halt. Status will change to **Stopped**. All leads collected so far are already saved and available for export.

---

## 4. How to Export CSV

Click **⬇ Download CSV** at any time — during or after extraction.

The file is saved as:
```
sales-nav-leads-YYYY-MM-DD_HH-MM-SS.csv
```

### CSV Fields

| Field | Description |
|---|---|
| `name` | Full name of the lead |
| `job_title` | Current job title as shown on the page |
| `company` | Current company as shown on the page |
| `location` | Geographic location |
| `profile_url` | LinkedIn Sales Navigator profile URL |
| `current_page_url` | URL of the search results page the lead was found on |
| `page_number` | Which result page (1, 2, 3 …) |
| `extracted_at` | ISO 8601 timestamp of when the row was extracted |

Values with commas, quotes, or line breaks are properly escaped per RFC 4180.

---

## 5. How to Clear Data

Click **✕ Clear Data** to permanently delete all stored leads and reset all counters to zero.  
This is useful when starting a fresh search after a previous run.

---

## 6. About Email Addresses

**This extension does not extract email addresses.**

LinkedIn does not display email addresses on Sales Navigator search result pages, so there is nothing to extract. The extension only reads what is visibly rendered in the DOM.

To find emails after exporting, upload your CSV to an external email-enrichment service such as:

- [Hunter.io](https://hunter.io) — domain-based email finder
- [Prospeo](https://prospeo.io) — LinkedIn URL to email
- [Apollo.io](https://apollo.io) — B2B contact database
- [Snov.io](https://snov.io) — email finder and verifier
- [Findymail](https://findymail.com) — Sales Navigator-integrated finder
- [Dropcontact](https://dropcontact.com) — GDPR-compliant enrichment

These services are external and unaffiliated with this extension.

---

## 7. Limitations

| Limitation | Detail |
|---|---|
| **Visible data only** | The extension reads what the browser has rendered. If a field is hidden or not loaded, it will be blank. |
| **No emails** | Emails are not shown on Sales Navigator search pages. |
| **LinkedIn DOM changes** | LinkedIn pushes redesigns frequently. If extraction returns 0 results, the CSS selectors in `content.js` (look for the `SEL` object) may need updating. |
| **Pagination limit** | LinkedIn caps Sales Navigator search results at a certain depth (typically 100 pages). The extension respects whatever LinkedIn shows. |
| **Rate limiting** | Use reasonable delays (7–10 s). Rapid page-turning may trigger LinkedIn's bot-detection, causing temporary blocks or CAPTCHAs. |
| **Single tab** | Run one extraction at a time in the active Sales Navigator tab. |

---

## 8. Privacy & Security

- All data is stored locally in `chrome.storage.local` on your own machine.
- No data is sent to any server.
- No cookies, session tokens, or private APIs are accessed.
- No CAPTCHA bypasses or LinkedIn-protection circumvention of any kind.

---

## 9. Updating Selectors (Advanced)

LinkedIn changes its HTML structure periodically. If the extension stops extracting data:

1. Open the Sales Navigator search results page.
2. Right-click a lead card → **Inspect**.
3. Find the elements that contain the name, title, company, and location.
4. Open `content.js` and update the `SEL` object near the top of the file.
5. Reload the extension at `chrome://extensions`.

The `SEL` arrays are tried in order; the first matching selector wins. Add new selectors at the top of each array rather than replacing them, so the file stays forward- and backward-compatible.

---

## Disclaimer

This extension reads only publicly visible information already rendered in your browser. It does not bypass any LinkedIn protections, does not access internal APIs, and does not perform any form of CAPTCHA bypass. Use responsibly and in accordance with [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement) and Terms of Service.

'use strict';

const dns = require('dns').promises;

/**
 * Look up MX records for a domain.
 *
 * @param {string} domain  e.g. "stripe.com"
 * @returns {Promise<{ hasMX: boolean, mx_host: string|null, error: string|null }>}
 */
async function checkMXRecords(domain) {
  if (!domain || typeof domain !== 'string') {
    return { hasMX: false, mx_host: null, error: 'No domain provided' };
  }

  const d = domain.trim().toLowerCase();

  try {
    const records = await dns.resolveMx(d);
    if (!records || records.length === 0) {
      return { hasMX: false, mx_host: null, error: 'No MX records found' };
    }
    // Sort by priority (lower = higher priority), pick the best one
    records.sort((a, b) => a.priority - b.priority);
    return { hasMX: true, mx_host: records[0].exchange, error: null };
  } catch (err) {
    const code = err.code || '';
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ESERVFAIL') {
      return { hasMX: false, mx_host: null, error: `DNS error: ${code}` };
    }
    return { hasMX: false, mx_host: null, error: err.message };
  }
}

module.exports = { checkMXRecords };

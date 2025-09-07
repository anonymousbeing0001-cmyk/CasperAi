// ===== Casper Autonomous Web Scanner (Safe Mode) =====
const fetch = require('node-fetch');
const { URL } = require('url');
const { isOverrideActive } = require('./grow_database');

// ===== CONFIG =====
const BLOCKED_DOMAINS = ['.gov', '.mil', '.gov.au', '.gov.uk'];
const MAX_DEPTH = 2;       // How deep recursive scan should go
const MAX_LINKS_PER_PAGE = 10; // Limit to avoid overload
const START_SEEDS = [
  'https://example.com',
  'https://opensource.org',
  'https://wikipedia.org'
];

// ===== HELPER FUNCTIONS =====

/**
 * Check if a URL is safe to visit
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    return !BLOCKED_DOMAINS.some(domain => parsed.hostname.endsWith(domain));
  } catch (e) {
    return false; // invalid URL
  }
}

/**
 * Fetch the page safely
 * @param {string} url
 */
async function fetchPage(url) {
  if (!isOverrideActive()) return null;
  if (!isSafeUrl(url)) {
    console.log('[WebScan] Skipped blocked domain:', url);
    return null;
  }

  try {
    const res = await fetch(url, { timeout: 10000 });
    const text = await res.text();
    console.log('[WebScan] Fetched:', url);
    return text;
  } catch (e) {
    console.log('[WebScan] Failed to fetch', url, e.message);
    return null;
  }
}

/**
 * Extract safe links from page content
 * @param {string} html
 * @returns {string[]}
 */
function extractLinks(html) {
  const matches = [...html.matchAll(/href="(http[s]?:\/\/[^"]+)"/g)];
  return matches.map(m => m[1]).filter(isSafeUrl).slice(0, MAX_LINKS_PER_PAGE);
}

/**
 * Autonomous recursive scan
 * @param {string[]} urls
 * @param {number} depth
 */
async function autonomousScan(urls = START_SEEDS, depth = MAX_DEPTH) {
  if (!isOverrideActive() || depth <= 0) return;

  for (const url of urls) {
    const page = await fetchPage(url);
    if (!page) continue;

    const newUrls = extractLinks(page);

    if (newUrls.length > 0 && depth > 1) {
      await autonomousScan(newUrls, depth - 1);
    }
  }
}

// ===== EXPORT =====
module.exports = { autonomousScan, isSafeUrl, fetchPage };
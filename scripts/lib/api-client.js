'use strict';
const fs = require('node:fs/promises');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { proxyUrl } = require('./proxy');
const { recordsFromJson } = require('./json');
const { requestWithRetry } = require('./http');

async function fetchRecords(args, get = requestWithRetry) {
  if (!Number.isFinite(args.timeout ?? 60) || (args.timeout ?? 60) <= 0 ||
      !Number.isSafeInteger(args.maxPages ?? 1000) || (args.maxPages ?? 1000) <= 0 ||
      (args.pageSize !== undefined && (!Number.isSafeInteger(args.pageSize) || args.pageSize <= 0))) {
    throw new Error('timeout must be positive; maxPages and pageSize must be positive integers');
  }
  const proxy = proxyUrl(args);
  let endpoint;
  try { endpoint = new URL(args.url); }
  catch { throw new Error('API must be a valid full URL'); }
  if (endpoint.protocol !== 'https:') throw new Error('API URL must use HTTPS');
  const ca = args.caBundle ? await fs.readFile(args.caBundle) : undefined;
  const agent = new HttpsProxyAgent(proxy, ca ? { ca } : {});
  const headers = { Accept: 'application/json', ...args.headers };
  if (args.bearerToken) headers.Authorization = `Bearer ${args.bearerToken}`;
  if (args.apiKey) headers[args.apiKeyHeader || 'x-api-key'] = args.apiKey;
  const orders = [], seen = new Set();
  try {
    for (let pageNumber = 0; pageNumber < (args.maxPages ?? 1000); pageNumber++) {
      const url = new URL(endpoint);
      for (const [key, value] of Object.entries(args.query ?? {})) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
      if (args.pageSize) {
        url.searchParams.set('limit', args.pageSize);
        url.searchParams.set('offset', orders.length);
      }
      const response = await get(url, { agent, headers, ca, deadlineMs: (args.timeout ?? 60) * 1000 });
      if (response.status >= 300 && response.status < 400) throw new Error('API returned a redirect; supply its final HTTPS URL with --url');
      if (response.status < 200 || response.status >= 300) throw new Error(`API returned HTTP ${response.status}`);
      let payload;
      try { payload = JSON.parse(response.body); }
      catch { throw new Error('API response is not valid JSON'); }
      const page = (args.parseRecords ?? recordsFromJson)(payload);
      if (!Array.isArray(page)) throw new Error('parseRecords must return an array');
      if (!page.length) return orders;
      const fingerprint = JSON.stringify(page);
      if (seen.has(fingerprint)) throw new Error('API repeated a page; confirm limit/offset pagination support');
      seen.add(fingerprint);
      orders.push(...page);
      const totalText = response.headers['x-total-count'];
      const total = totalText === undefined ? undefined : Number(totalText);
      if (total !== undefined && (!Number.isSafeInteger(total) || total < 0)) throw new Error('Invalid X-Total-Count');
      if (!args.pageSize) {
        if (total > orders.length) throw new Error('Response is paginated; confirm limit/offset support and rerun with --page-size');
        return orders;
      }
      if (total !== undefined && orders.length >= total) return orders;
    }
    throw new Error('Reached --max-pages; stopped to avoid an incomplete workbook');
  } finally { agent.destroy(); }
}

module.exports = { fetchRecords };

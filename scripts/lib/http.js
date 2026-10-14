'use strict';
const https = require('node:https');
const { setTimeout: sleep } = require('node:timers/promises');

function requestOnce(url, options) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    // Covers DNS, proxy CONNECT, TLS and response body with one deadline.
    const timer = setTimeout(() => {
      const error = new Error('API request timed out');
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    }, options.deadlineMs);
    request.on('error', reject);
    request.on('close', () => clearTimeout(timer));
  });
}

async function requestWithRetry(url, options) {
  const transient = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN']);
  for (let attempt = 0; attempt <= 3; attempt++) {
    let result;
    try { result = await requestOnce(url, options); }
    catch (error) {
      if (attempt === 3 || !transient.has(error.code)) throw new Error(`API connection failed (${error.code || 'NETWORK_ERROR'})`);
    }
    if (result && ![429, 500, 502, 503, 504].includes(result.status)) return result;
    if (attempt === 3) return result;
    const retryAfter = result?.headers['retry-after'];
    let delay = 1000 * 2 ** attempt;
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(requested)) delay = Math.max(delay, requested);
    }
    await sleep(delay);
  }
}

module.exports = { requestOnce, requestWithRetry };

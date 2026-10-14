'use strict';
const fs = require('node:fs/promises');

function recordsFromJson(payload, { idKey = 'id', collectionKeys = ['productOrder', 'productOrders', 'items', 'content', 'data'] } = {}) {
  if (payload && !Array.isArray(payload) && typeof payload === 'object') {
    if (idKey in payload) payload = [payload];
    else payload = collectionKeys
      .map(key => payload[key]).find(Array.isArray);
  }
  if (!Array.isArray(payload) || payload.some(x => !x || typeof x !== 'object' || Array.isArray(x))) {
    throw new Error('Expected a record object, array, or supported collection wrapper');
  }
  return payload;
}

async function readJson(file) {
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

module.exports = { recordsFromJson, readJson };

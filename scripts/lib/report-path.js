'use strict';
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/** Append generation date/time in Sri Lanka time and a unique run identifier. */
function createReportPath(output, { generatedAt = new Date(), timeZone = 'Asia/Colombo' } = {}) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    fractionalSecondDigits: 3,
  }).formatToParts(generatedAt).map(part => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${parts.hour}-${parts.minute}-${parts.second}-${parts.fractionalSecond}`;
  const file = path.parse(output);
  return path.join(file.dir, `${file.name}_${date}_${time}_${randomUUID().slice(0, 8)}${file.ext || '.xlsx'}`);
}

module.exports = { createReportPath };

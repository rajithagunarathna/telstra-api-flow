'use strict';
const path = require('node:path');
const { cliArgs } = require('./config/cli');
const { readJson, recordsFromJson } = require('./lib/json');
const report = require('./reports/jasper-orders');
const { createReportPath } = require('./lib/report-path');

async function main() {
  const args = cliArgs();
  if (!args) return;
  const orders = args.input ? recordsFromJson(await readJson(args.input)) : await report.fetchData(args);
  const source = args.input ? 'Source: supplied JSON response (sample data)'
    : `Source: productOrder API; state=${args.state}; atType=${args.atType}`;
  const output = createReportPath(args.output);
  const count = await report.generateExcel(orders, output, source);
  console.log(`Exported ${orders.length} orders / ${count} item rows to ${path.resolve(output)}`);
}

if (require.main === module) main().catch(error => {
  const message = error.message.replace(/https?:\/\/[^\s]+/g, '[URL]');
  console.error(`Export failed: ${message}`);
  process.exitCode = 1;
});

// Preserve existing imports. New reports should import lib modules directly.
module.exports = { main, ...report, recordsFromJson,
  utcDate: require('./lib/dates').utcDate, proxyUrl: require('./lib/proxy').proxyUrl };


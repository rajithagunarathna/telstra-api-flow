'use strict';
const { parseArgs } = require('node:util');
const { DEFAULT_URL } = require('../reports/jasper-orders');

function cliArgs(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({ args: argv, options: {
    input: { type: 'string' }, output: { type: 'string', default: 'jasper_orders.xlsx' },
    url: { type: 'string', default: DEFAULT_URL }, proxy: { type: 'string', default: env.API_PROXY },
    'proxy-host': { type: 'string', default: env.API_PROXY_HOST },
    'proxy-port': { type: 'string', default: env.API_PROXY_PORT },
    'proxy-scheme': { type: 'string', default: env.API_PROXY_SCHEME },
    'proxy-username': { type: 'string', default: env.API_PROXY_USERNAME },
    'proxy-password': { type: 'string', default: env.API_PROXY_PASSWORD },
    state: { type: 'string', default: 'FAILED' }, 'at-type': { type: 'string', default: 'JasperProductOrder' },
    'page-size': { type: 'string' }, 'max-pages': { type: 'string', default: '1000' },
    timeout: { type: 'string', default: '60' }, 'ca-bundle': { type: 'string', default: env.API_CA_BUNDLE },
    help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) {
    console.log('Usage: node export_orders.js [--input response.json] [--output report.xlsx]\n' +
      'Live: --proxy URL (or API_PROXY), --url URL, --state FAILED, --at-type JasperProductOrder\n' +
      'Proxy: --proxy-host HOST --proxy-port PORT --proxy-username USER --proxy-password PASSWORD\n' +
      'Environment: API_PROXY_HOST, API_PROXY_PORT, API_PROXY_USERNAME, API_PROXY_PASSWORD, API_PROXY_SCHEME (http)\n' +
      'Options: --page-size N (limit/offset), --max-pages N (1000), --timeout SECONDS (60), --ca-bundle FILE\n' +
      'Authentication: API_BEARER_TOKEN or API_KEY and optional API_KEY_HEADER');
    return null;
  }
  const args = { ...values, atType: values['at-type'], caBundle: values['ca-bundle'],
    proxyHost: values['proxy-host'], proxyPort: values['proxy-port'], proxyScheme: values['proxy-scheme'],
    proxyUsername: values['proxy-username'], proxyPassword: values['proxy-password'],
    pageSize: values['page-size'] === undefined ? undefined : Number(values['page-size']),
    maxPages: Number(values['max-pages']), timeout: Number(values.timeout),
    bearerToken: env.API_BEARER_TOKEN, apiKey: env.API_KEY, apiKeyHeader: env.API_KEY_HEADER };
  if (!Number.isFinite(args.timeout) || args.timeout <= 0 ||
      !Number.isSafeInteger(args.maxPages) || args.maxPages <= 0 ||
      (args.pageSize !== undefined && (!Number.isSafeInteger(args.pageSize) || args.pageSize <= 0))) {
    throw new Error('timeout must be positive; max-pages and page-size must be positive integers');
  }
  return args;
}

module.exports = { cliArgs };

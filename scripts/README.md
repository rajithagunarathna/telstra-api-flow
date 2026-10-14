# Jasper orders Excel export (Node.js + ExcelJS)

Use Node.js 20+ and run from this directory:

```powershell
npm install
$env:API_PROXY_HOST = 'your-proxy-host'
$env:API_PROXY_PORT = '8080'
$env:API_PROXY_USERNAME = 'your-username'
$env:API_PROXY_PASSWORD = 'your-password'
node export_orders.js --output jasper_orders.xlsx
```

Alternatively, create `.env` in this directory:

```dotenv
API_PROXY_HOST=proxy.company.com
API_PROXY_PORT=8080
API_PROXY_USERNAME=your-username
API_PROXY_PASSWORD="your-password"
```

Load it explicitly with Node.js (20.6+):

```powershell
node --env-file=.env export_orders.js --output jasper_orders.xlsx
```

The script does not automatically load `.env` without this flag. Existing environment variables take precedence over values in the file, so clear previously set `API_PROXY_*` variables if needed. Quote passwords containing `#` to keep it from starting a comment. `.env` is excluded from Git by `.gitignore`.

Every CLI export appends its generation date, time with milliseconds (Asia/Colombo), and a short unique run ID before the extension. For example, `--output jasper_orders.xlsx` produces `jasper_orders_2026-10-14_14-35-20-123_a8b1c2d3.xlsx`. Custom filenames and output directories are preserved. The command prints the actual saved path. Other report entry points can use `createReportPath(output)` from `lib/report-path.js` before calling their export function.

The default GET endpoint uses `state=FAILED&atType=JasperProductOrder`, matching the supplied curl. All live requests use `https-proxy-agent` with HTTP CONNECT to the HTTPS API. `NO_PROXY` does not bypass the explicit agent. HTTP and HTTPS proxies are supported. Integrated Windows proxy authentication and SOCKS proxies are not included.

Set the host as a hostname or IP address without a scheme (e.g. `proxy.company.com`). `API_PROXY_SCHEME` defaults to `http`; set it to `https` for an HTTPS proxy. If the port is omitted, the scheme's default port is used. Omit both username and password settings for a proxy without authentication. Supply raw credentials: special characters are encoded automatically.

You can also pass `--proxy-host`, `--proxy-port`, `--proxy-scheme`, `--proxy-username` and `--proxy-password`. Environment variables are preferable for passwords so they do not appear in process arguments. The original `API_PROXY` / `--proxy` URL remains supported. A separate host takes precedence over that URL; separate port and credential settings override values in the selected URL. Each command-line setting overrides its matching environment variable.

If authentication or corporate certificates are needed:

```powershell
$env:API_BEARER_TOKEN = 'your-token'
$env:API_CA_BUNDLE = 'C:\certificates\corporate-ca.pem'
node export_orders.js
```

Alternatively set `API_KEY` and optionally `API_KEY_HEADER` (default `x-api-key`). These authenticate with the API; proxy username/password authenticate separately with the proxy using Basic authentication. TLS verification stays enabled. A custom CA file applies to the API connection and an HTTPS proxy connection. Keep credentials in environment variables. The legacy proxy URL can also contain `http://username:password@host:port`; when using that format, URL-encode special characters yourself.

Export a saved JSON response without making an API call:

```powershell
node export_orders.js --input 'C:\path\response.json' --output sample_orders.xlsx
```

Each product order item becomes a row. Order fields repeat for multiple items; orders without items still get a row. The ten columns are Order ID, State, Customer, Jasper Order ID, Jasper Account ID, Product, Quantity, Requested Start (UTC), Failed Step and Error Summary. IDs stay text. Dates are sortable Excel dates in UTC with millisecond precision, displayed to seconds. Error summaries contain the first line of each ErrorNote and omit stack traces. Edit the column definitions and `orderRows()` in `reports/jasper-orders.js` to customize fields.

The script accepts a single order, an array, or array wrappers named `productOrder`, `productOrders`, `items`, `content`, or `data`. The default fetches one response because the pagination contract was not supplied. If `X-Total-Count` indicates more records, it reports that pagination is needed. After confirming limit/offset support:

```powershell
node export_orders.js --page-size 100 --output jasper_orders.xlsx
```

Pagination ends at `X-Total-Count` or an empty page, rejects repeated pages, and fails rather than writing a partial workbook when `--max-pages` is reached. Without a total count, it sends an extra request for the final empty page. Transient connection errors and HTTP 429/500/502/503/504 are retried up to three times with backoff and Retry-After support. Redirects are rejected. `--timeout` sets the deadline per request attempt in seconds (default 60).

Run `node export_orders.js --help` for options, or `npm run export -- --output report.xlsx`. Run `npm test` for offline tests. The sample workbook comes from the attached response; live access requires your real proxy and any required authentication.

Library references: [ExcelJS](https://github.com/exceljs/exceljs#readme), [https-proxy-agent](https://github.com/TooTallNate/proxy-agents/tree/main/packages/https-proxy-agent).

## Project structure

```text
export_orders.js           Command entry point and export workflow
config/cli.js              CLI options, environment settings and validation
reports/jasper-orders.js  Jasper endpoint, query, columns and row mapping
lib/api-client.js          Reusable proxied JSON GET and limit/offset pagination
lib/http.js                HTTP request deadlines and retries
lib/proxy.js               Proxy URL construction and credential validation
lib/json.js                JSON file reading and collection extraction
lib/dates.js               UTC date conversion
lib/report-path.js         Generation date/time and unique report filenames
lib/excel.js               Reusable ExcelJS workbook creation and saving
test_export_orders.js      Offline tests
```

The command and `.env` settings remain the same. Existing imports from `export_orders.js` remain supported; new reports should import the shared modules directly.

## Create another report

Add a module under `reports/` with its own columns and data mapping. Shared Excel functions accept any iterable of row arrays, including generators. Every row must contain exactly one value per column. Keep identifiers as strings, counts as numbers and dates as `Date` objects.

For example, `reports/customers.js` can expose this function:

```javascript
const { exportReport } = require('../lib/excel');
const { utcDate } = require('../lib/dates');

async function exportCustomers(customers, output) {
  return exportReport({
    sheetName: 'Customers',
    title: 'Customer report',
    source: 'Source: customer API',
    columns: [
      { header: 'Customer ID', width: 22 },
      { header: 'Name', width: 30 },
      { header: 'Created (UTC)', width: 25, numberFormat: 'yyyy-mm-dd hh:mm:ss' },
    ],
    rows: customers.map(customer => [
      String(customer.id ?? ''), customer.name ?? '', utcDate(customer.createdAt),
    ]),
  }, output);
}

module.exports = { exportCustomers };
```

For another API, call `fetchRecords()` from `lib/api-client.js` with an HTTPS URL and connection settings:

```javascript
const { fetchRecords } = require('./lib/api-client');
const { recordsFromJson } = require('./lib/json');

const customers = await fetchRecords({
  url: 'https://your-api.example/customers',
  proxyHost: process.env.API_PROXY_HOST,
  proxyPort: process.env.API_PROXY_PORT,
  proxyScheme: process.env.API_PROXY_SCHEME,
  proxyUsername: process.env.API_PROXY_USERNAME,
  proxyPassword: process.env.API_PROXY_PASSWORD,
  caBundle: process.env.API_CA_BUNDLE,
  bearerToken: process.env.API_BEARER_TOKEN,
  query: { status: 'ACTIVE' },
  timeout: 60,
  // Enable pageSize only if this API supports limit/offset.
  parseRecords: payload => recordsFromJson(payload, { collectionKeys: ['customers'] }),
});
```

Use the API example inside an async function. `fetchRecords()` accepts `query`, optional custom `headers`, `bearerToken`, `apiKey`, `apiKeyHeader`, `pageSize`, `maxPages` and `parseRecords`. Defaults are a 60-second timeout, 1000 maximum pages, and a single response unless `pageSize` is set. It does not read environment variables itself; pass the settings explicitly. The Jasper CLI obtains them in `config/cli.js`.

`createWorkbook(options)` returns `{ workbook, sheet, count }` for additional ExcelJS customization. `saveWorkbook(workbook, output)` saves it. `exportReport(options, output)` combines both and returns the exported row count. Column options are `header`, `width`, `wrapText` and `numberFormat`; workbook options include `sheetName`, `title`, `source`, `columns`, `rows`, `rowHeight`, `headerRow` (default 5) and `freezeColumns` (default 1).

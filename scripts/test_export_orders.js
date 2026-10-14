'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { recordsFromJson, orderRows, buildWorkbook, fetchData, proxyUrl } = require('./export_orders');

const args = { proxy: 'http://proxy.example:8080', url: 'https://api.example/orders',
  state: 'FAILED', atType: 'JasperProductOrder', timeout: 60, maxPages: 10, pageSize: 100 };
const response = (data, headers = {}) => ({ status: 200, headers, body: JSON.stringify(data) });
const { createWorkbook } = require('./lib/excel');
const { fetchRecords } = require('./lib/api-client');
const { cliArgs } = require('./config/cli');
const { createReportPath } = require('./lib/report-path');
const path = require('node:path');

test('report names contain local generation date, milliseconds and a unique suffix', () => {
  const options = { generatedAt: new Date('2026-10-14T20:30:40.123Z') };
  const base = path.join('reports', 'jasper_orders.xlsx');
  const first = createReportPath(base, options);
  const second = createReportPath(base, options);
  assert.match(path.basename(first), /^jasper_orders_2026-10-15_02-00-40-123_[a-f0-9]{8}\.xlsx$/);
  assert.equal(path.dirname(first), 'reports');
  assert.notEqual(first, second);
  assert.match(createReportPath('custom', options), /^custom_.*\.xlsx$/);
});

test('shared workbook supports a different report with custom columns and dates', async () => {
  const { workbook, count } = createWorkbook({ sheetName: 'Customers', title: 'Customer report',
    columns: [{ header: 'ID' }, { header: 'Balance', numberFormat: '0.00' },
      { header: 'Joined', numberFormat: 'yyyy-mm-dd' }],
    rows: [['0001', 0, new Date('2026-10-14T00:00:00Z')]], freezeColumns: 0, headerRow: 6 });
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = loaded.getWorksheet('Customers');
  assert.equal(count, 1);
  assert.equal(sheet.getCell('A7').value, '0001');
  assert.equal(sheet.getCell('B7').value, 0);
  assert.equal(sheet.getCell('B7').numFmt, '0.00');
  assert.equal(sheet.getCell('C7').value.toISOString(), '2026-10-14T00:00:00.000Z');
  assert.equal(sheet.autoFilter, 'A6:C7');
  assert.throws(() => createWorkbook({ columns: [{ header: 'ID' }], rows: [['a', 'b']] }), /match/);
});

test('shared API client supports other query parameters, wrappers and explicit authentication', async () => {
  const data = await fetchRecords({ ...args, pageSize: undefined, query: { status: 'ACTIVE', optional: null },
    bearerToken: 'test-token', apiKey: 'test-key', apiKeyHeader: 'x-custom-key',
    parseRecords: payload => recordsFromJson(payload, { collectionKeys: ['customers'] }) },
  async (url, options) => {
    assert.equal(url.searchParams.get('status'), 'ACTIVE');
    assert.equal(url.searchParams.has('state'), false);
    assert.equal(url.searchParams.has('atType'), false);
    assert.equal(url.searchParams.has('optional'), false);
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.headers['x-custom-key'], 'test-key');
    return response({ customers: [{ id: '0001' }] });
  });
  assert.deepEqual(data, [{ id: '0001' }]);
});

test('CLI preserves proxy environment settings and argument precedence', () => {
  const options = cliArgs(['--proxy-port', '9000'], { API_PROXY_HOST: 'proxy.example',
    API_PROXY_PORT: '8080', API_PROXY_USERNAME: 'user', API_PROXY_PASSWORD: 'secret',
    API_BEARER_TOKEN: 'token' });
  assert.equal(options.proxyHost, 'proxy.example');
  assert.equal(options.proxyPort, '9000');
  assert.equal(options.proxyPassword, 'secret');
  assert.equal(options.bearerToken, 'token');
  assert.equal(options.state, 'FAILED');
});

test('separate proxy settings encode credentials and override legacy URL', () => {
  const proxy = proxyUrl({ proxy: 'http://old.example:8000', proxyHost: 'new.example',
    proxyPort: '8080', proxyUsername: 'DOMAIN\\user@company', proxyPassword: 'p@ss:%/#word' });
  assert.equal(proxy.hostname, 'new.example');
  assert.equal(proxy.port, '8080');
  assert.equal(decodeURIComponent(proxy.username), 'DOMAIN\\user@company');
  assert.equal(decodeURIComponent(proxy.password), 'p@ss:%/#word');
  assert.equal(proxyUrl({ proxy: 'http://legacy.example:9000' }).port, '9000');
  assert.throws(() => proxyUrl({ proxyHost: 'proxy.example', proxyPassword: 'secret' }), /both/);
  assert.throws(() => proxyUrl({ proxyHost: 'proxy.example', proxyPort: '65536' }), /port/);
  assert.throws(() => proxyUrl({ proxyHost: 'proxy.example/path' }), /host and port/);
});

test('authenticated proxy settings go to agent, not API headers', async () => {
  await fetchData({ ...args, pageSize: undefined, proxy: undefined, proxyHost: 'proxy.example',
    proxyPort: '8080', proxyUsername: 'test-user', proxyPassword: 'p@ss:word' }, async (url, options) => {
    assert.equal(options.agent.proxy.hostname, 'proxy.example');
    assert.equal(decodeURIComponent(options.agent.proxy.password), 'p@ss:word');
    assert.equal(options.headers['Proxy-Authorization'], undefined);
    return response([]);
  });
});

test('response wrappers and invalid responses', () => {
  const order = { id: '001' };
  for (const payload of [order, [order], { content: [order] }, { data: [order] }]) {
    assert.deepEqual(recordsFromJson(payload), [order]);
  }
  assert.deepEqual(recordsFromJson([]), []);
  for (const payload of [null, { error: 'Unauthorized' }, ['bad']]) {
    assert.throws(() => recordsFromJson(payload));
  }
});

test('multiple items, zero quantity and no items', () => {
  const rows = [...orderRows([{ id: '001', productOrderItem: [{ quantity: 0 }, { quantity: 2 }] }])];
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x[6]), [0, 2]);
  assert.equal(rows[0][7], null);
  assert.equal([...orderRows([{ id: 'no-items' }])].length, 1);
});

test('serialized Excel retains IDs, literal text, UTC dates, errors and filters', async () => {
  const order = { id: '000123', state: 'Failed', requestedStartDate: '2025-12-02T16:02:56.372126269Z',
    externalId: [{ externalIdentifierType: 'jasperOrderId', id: '00045' }],
    relatedParty: [{ role: 'Customer', partyOrPartyRole: { name: '=1+1' } }],
    note: [{ '@type': 'ErrorNote', text: 'Shipping error\nstack trace' }],
    productOrderMilestone: [{ status: 'Failed', message: 'ShippingOrderPlacement' }],
    productOrderItem: [{ quantity: 2, productOffering: { name: 'Samsung S20' } }] };
  const { workbook, count } = buildWorkbook([order], 'Source: test JSON');
  assert.equal(count, 1);
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = loaded.getWorksheet('Jasper Orders');
  assert.equal(sheet.getCell('A6').value, '000123');
  assert.equal(sheet.getCell('D6').value, '00045');
  assert.equal(sheet.getCell('C6').value, '=1+1');
  assert.equal(sheet.getCell('G6').value, 2);
  assert.equal(sheet.getCell('H6').value.toISOString(), '2025-12-02T16:02:56.372Z');
  assert.equal(sheet.getCell('I6').value, 'ShippingOrderPlacement');
  assert.equal(sheet.getCell('J6').value, 'Shipping error');
  assert.equal(sheet.autoFilter, 'A5:J6');
  assert.equal(sheet.views[0].xSplit, 1);
  assert.equal(sheet.views[0].ySplit, 5);
});

test('pagination always receives proxy agent and advances by actual page length', async () => {
  const offsets = [];
  const data = [[{ id: '1' }], [{ id: '2' }], []];
  const orders = await fetchData(args, async (url, options) => {
    assert.ok(options.agent instanceof HttpsProxyAgent);
    assert.equal(url.searchParams.get('state'), 'FAILED');
    assert.equal(url.searchParams.get('atType'), 'JasperProductOrder');
    offsets.push(url.searchParams.get('offset'));
    return response(data.shift());
  });
  assert.deepEqual(offsets, ['0', '1', '2']);
  assert.deepEqual(orders.map(x => x.id), ['1', '2']);
});

test('rejects missing proxy, repeated pages, incomplete single response and max-page limit', async () => {
  await assert.rejects(fetchData({ ...args, proxy: undefined }), /requires/);
  await assert.rejects(fetchData(args, async () => response([{ id: '1' }])), /repeated/);
  await assert.rejects(fetchData({ ...args, pageSize: undefined },
    async () => response([{ id: '1' }], { 'x-total-count': '2' })), /paginated/);
  await assert.rejects(fetchData({ ...args, maxPages: 1 },
    async () => response([{ id: '1' }])), /max-pages/);
});

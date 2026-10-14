'use strict';
const { utcDate } = require('../lib/dates');
const { fetchRecords } = require('../lib/api-client');
const { createWorkbook, saveWorkbook } = require('../lib/excel');

const DEFAULT_URL = 'https://dev-orderexpress.08894fb17d.sdpamp.com/tox-tx-layer-product-ordering-mgt/tmf-api/productOrderingManagement/v5/productOrder';
const columns = [
  { header: 'Order ID', width: 22 },
  { header: 'State', width: 12 },
  { header: 'Customer', width: 22 },
  { header: 'Jasper Order ID', width: 20 },
  { header: 'Jasper Account ID', width: 20 },
  { header: 'Product', width: 24, wrapText: true },
  { header: 'Quantity', width: 12, numberFormat: '#,##0' },
  { header: 'Requested Start (UTC)', width: 25, numberFormat: 'yyyy-mm-dd hh:mm:ss' },
  { header: 'Failed Step', width: 28, wrapText: true },
  { header: 'Error Summary', width: 85, wrapText: true },
];
const COLUMNS = columns.map(column => column.header);

function* orderRows(orders) {
  for (const order of orders) {
    const external = Object.fromEntries((order.externalId ?? [])
      .map(x => [x.externalIdentifierType, String(x.id ?? '')]));
    const customer = (order.relatedParty ?? []).find(x => String(x.role).toLowerCase() === 'customer')
      ?.partyOrPartyRole?.name ?? '';
    const failed = (order.productOrderMilestone ?? []).filter(x => String(x.status).toLowerCase() === 'failed')
      .map(x => x.message || x.name || '').join('; ');
    const errors = (order.note ?? []).filter(x => x['@type'] === 'ErrorNote' && x.text)
      .map(x => String(x.text).split(/\r?\n/)[0]).join('\n');
    for (const item of order.productOrderItem?.length ? order.productOrderItem : [{}]) {
      yield [String(order.id ?? ''), order.state ?? '', customer,
        external.jasperOrderId ?? '', external.jasperAccountId ?? '',
        item.productOffering?.name ?? '', item.quantity ?? null,
        utcDate(order.requestedStartDate), failed, errors];
    }
  }
}

function buildWorkbook(orders, source) {
  return createWorkbook({ sheetName: 'Jasper Orders', title: 'Jasper product orders',
    source, columns, rows: orderRows(orders), rowHeight: 90 });
}

async function generateExcel(orders, output, source) {
  const { workbook, count } = buildWorkbook(orders, source);
  await saveWorkbook(workbook, output);
  return count;
}

function fetchData(args, get) {
  return fetchRecords({ ...args, query: { ...args.query, state: args.state, atType: args.atType } }, get);
}

module.exports = { DEFAULT_URL, COLUMNS, columns, orderRows, buildWorkbook, generateExcel, fetchData };


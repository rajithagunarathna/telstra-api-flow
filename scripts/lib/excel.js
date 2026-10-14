'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');

/** Columns: { header, width?, wrapText?, numberFormat? }; rows: iterable of arrays. */
function createWorkbook({ sheetName = 'Report', title = 'Report', source = '', columns, rows,
  headerRow = 5, freezeColumns = 1, rowHeight = 24 }) {
  if (!Array.isArray(columns) || !columns.length) throw new Error('Report needs at least one column');
  if (!Number.isInteger(headerRow) || headerRow < 5 || headerRow >= 1048576) {
    throw new Error('headerRow must be between 5 and 1048575');
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', xSplit: freezeColumns, ySplit: headerRow, showGridLines: false }],
  });
  sheet.getCell('A2').value = title;
  sheet.getCell('A2').font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF17365D' } };
  sheet.getCell('A3').value = source;
  sheet.getCell('A3').font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF666666' } };
  columns.forEach((column, index) => { sheet.getColumn(index + 1).width = column.width ?? 22; });
  const header = sheet.getRow(headerRow);
  header.values = columns.map(column => column.header);
  header.height = 30;
  header.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  let count = 0;
  for (const values of rows) {
    if (!Array.isArray(values) || values.length !== columns.length) throw new Error('Row values must match the report columns');
    if (count >= 1048576 - headerRow) throw new Error('Export exceeds Excel row limit');
    const row = sheet.addRow(values.map(value => {
      if (typeof value !== 'string') return value;
      const text = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
      if (text.length > 32767) throw new Error('A value exceeds Excel cell character limit');
      return text;
    }));
    count++;
    row.height = rowHeight;
    columns.forEach((column, index) => {
      const cell = row.getCell(index + 1);
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF202020' } };
      cell.alignment = { vertical: 'top', wrapText: column.wrapText ?? false,
        horizontal: typeof cell.value === 'string' ? 'left' : 'right' };
      // Strings stay literal text; formulas require an explicit ExcelJS formula object.
      if (typeof cell.value === 'string') cell.numFmt = '@';
      else if (cell.value instanceof Date) cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      if (column.numberFormat) cell.numFmt = column.numberFormat;
      if (row.number % 2 === 0) cell.fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FA' },
      };
    });
  }
  sheet.autoFilter = { from: { row: headerRow, column: 1 },
    to: { row: Math.max(headerRow, sheet.rowCount), column: columns.length } };
  return { workbook, sheet, count };
}

async function saveWorkbook(workbook, output) {
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await workbook.xlsx.writeFile(output);
}

async function exportReport(options, output) {
  const { workbook, count } = createWorkbook(options);
  await saveWorkbook(workbook, output);
  return count;
}

module.exports = { createWorkbook, saveWorkbook, exportReport };

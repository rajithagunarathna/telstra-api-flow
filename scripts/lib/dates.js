'use strict';
function utcDate(value) {
  if (!value) return null;
  let text = String(value);
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(text)) text += 'Z';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date value');
  return date;
}

module.exports = { utcDate };

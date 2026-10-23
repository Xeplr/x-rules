// CONDITIONAL FORMATTING, as a condition language.
//
// "When margin is under zero" is the same question whether the answer paints
// a bar, a table cell, a metric or an arrow. This package owns that question
// and nothing else: it says whether a rule MATCHES a value, and how to format
// one. What to DO about a match belongs to whatever is drawing — a chart sets
// ECharts channels, a table sets CSS, a DOM widget sets a style object, and
// none of those have an implementation to share.
//
// It lives on its own because the alternative addresses are all wrong. It
// began inside the charting package, which meant a table wanting to ask "is
// this less than zero" had to depend on a chart library. Moving it to the BI
// report engine would have made a shared package depend on a product one. So:
// no dependencies, imported by anything.
//
//   A RULE
//     { field, op, value, value2?, target?, series?, then: { … } }
//
//   field    the column to TEST — any column in the data, not only a plotted
//            or displayed one. A bar can be sized by revenue and coloured by
//            margin; a table row can be shaded by a column it does not show.
//   op       see OPERATORS
//   then     what to do about a match. NOT interpreted here — its vocabulary
//            belongs to the target, which is the only thing that knows what a
//            legal property is.
//
// ORDER MATTERS: callers apply the FIRST matching rule. That is a convention
// this package does not enforce, because "first" only means something once
// somebody has decided what the list is.

// ── the operators ────────────────────────────────────────────────────────
//
// Data, not a switch, so a UI can build a picker from them and can tell which
// ones a column supports without a second list to keep in step. `numeric`
// means the comparison only answers over numbers — offering "is more than"
// on a column of names is a control that can never be true.

//
// Each belongs to a GROUP — the kind of value it is about. A picker shows
// every group, the column's own kind first (operatorGroups): which one a
// column is is a guess from its values, and a guess must never hide the
// comparison somebody actually wants.
var OPERATORS = [
  { key: 'lt', label: 'is less than', numeric: true, group: 'number' },
  { key: 'lte', label: 'is at most', numeric: true, group: 'number' },
  { key: 'gt', label: 'is more than', numeric: true, group: 'number' },
  { key: 'gte', label: 'is at least', numeric: true, group: 'number' },
  { key: 'between', label: 'is between', numeric: true, second: true, group: 'number' },
  { key: 'eq', label: 'is', group: 'any' },
  { key: 'neq', label: 'is not', group: 'any' },
  { key: 'contains', label: 'contains', group: 'text' },
  { key: 'startsWith', label: 'starts with', group: 'text' },
  { key: 'endsWith', label: 'ends with', group: 'text' },
  { key: 'isEmpty', label: 'is blank', noValue: true, group: 'any' },
  { key: 'notEmpty', label: 'is not blank', noValue: true, group: 'any' },
  // Added after the first twelve, so OPERATORS[0] and the old order stand.
  { key: 'notContains', label: 'does not contain', group: 'text' },
  { key: 'dateOn', label: 'is on', date: true, group: 'date' },
  { key: 'dateBefore', label: 'is before', date: true, group: 'date' },
  { key: 'dateAfter', label: 'is after', date: true, group: 'date' },
  { key: 'dateBetween', label: 'is between dates', date: true, second: true, group: 'date' },
  // About ALL the rows, not one: "the highest point green". One value alone
  // cannot say whether it is the highest, so these need resolveRules over the
  // rows first; matched without that, they match nothing.
  { key: 'isHighest', label: 'is the highest', numeric: true, noValue: true, needsRows: true, group: 'number' },
  { key: 'isLowest', label: 'is the lowest', numeric: true, noValue: true, needsRows: true, group: 'number' }
];

var BY_KEY = {};
OPERATORS.forEach(function (o) { BY_KEY[o.key] = o; });

function operator(key) { return BY_KEY[key] || null; }

/**
 * The operators for a column, by the old yes/no "is it numeric" question —
 * kept for callers that ask it. New code: operatorGroups, which hides nothing.
 */
function operatorsFor(isNumeric) {
  return isNumeric ? OPERATORS.slice() : OPERATORS.filter(function (o) { return !o.numeric; });
}

/** The groups, as a picker heads them. */
var OPERATOR_GROUPS = [
  { key: 'number', label: 'Number' },
  { key: 'text', label: 'Text' },
  { key: 'date', label: 'Date' },
  { key: 'any', label: 'Any value' }
];

/**
 * EVERY operator, grouped by the kind of value it is about, the column's own
 * kind first (`kind`: 'number' | 'text' | 'date', or null when not known).
 * Nothing is left out: a number stored as text, or a code that looks like a
 * number, still gets the comparison somebody wants.
 */
function operatorGroups(kind) {
  var order = OPERATOR_GROUPS.slice().sort(function (a, b) {
    return (a.key === kind ? -1 : 0) - (b.key === kind ? -1 : 0);
  });
  return order.map(function (g) {
    return { key: g.key, label: g.label, operators: OPERATORS.filter(function (o) { return o.group === g.key; }) };
  });
}

/** The comparison a new rule starts with, for a column of this kind. */
function defaultOperator(kind) {
  if (kind === 'number') return 'gt';
  if (kind === 'date') return 'dateAfter';
  if (kind === 'text') return 'contains';
  return 'eq';
}

// ── comparing ────────────────────────────────────────────────────────────
//
// Numeric where both sides genuinely are numbers, textual otherwise. That is
// what somebody means by "is more than" over a column of numbers stored as
// strings — which is how several drivers return a decimal — and by "is" over
// a column of department names.

function asNumber(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) return Number(v);
  return null;
}

function asText(v) {
  return v === null || v === undefined ? '' : String(v).toLowerCase();
}

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

// A value as a DAY, 'YYYY-MM-DD', or null. A Date reads as its own calendar
// day; text that begins with a date (an ISO stamp, '2025-04-01 10:00') reads
// as that day. Days compare as text, in order.
var DAY = /^(\d{4})-(\d{2})-(\d{2})/;
function asDay(v) {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    var m = v.getMonth() + 1, d = v.getDate();
    return v.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  if (typeof v !== 'string') return null;
  var hit = DAY.exec(v.trim());
  return hit ? hit[1] + '-' + hit[2] + '-' + hit[3] : null;
}

/**
 * Whether a rule matches a value.
 *
 * Pure, total, and dependency-free — it is the one piece of conditional
 * formatting that every renderer shares, so it must be importable by all of
 * them without dragging anything along.
 */
function matches(rule, actual) {
  if (!rule) return false;
  var op = rule.op;
  if (op === 'isEmpty') return isBlank(actual);
  if (op === 'notEmpty') return !isBlank(actual);

  var a = asNumber(actual);
  var b = asNumber(rule.value);
  var numeric = a !== null && b !== null;

  switch (op) {
    case 'lt': return numeric && a < b;
    case 'lte': return numeric && a <= b;
    case 'gt': return numeric && a > b;
    case 'gte': return numeric && a >= b;
    case 'between': {
      var c = asNumber(rule.value2);
      if (a === null || b === null || c === null) return false;
      return a >= Math.min(b, c) && a <= Math.max(b, c);
    }
    // Equality reads as a NUMBER when both sides are numbers, so "is 0" also
    // matches "0.0" and the string "0" — one setting rather than three.
    case 'eq': return numeric ? a === b : asText(actual) === asText(rule.value);
    case 'neq': return numeric ? a !== b : asText(actual) !== asText(rule.value);
    case 'contains': return asText(actual).indexOf(asText(rule.value)) >= 0;
    case 'notContains': return asText(actual).indexOf(asText(rule.value)) < 0;
    case 'dateOn': case 'dateBefore': case 'dateAfter': case 'dateBetween': {
      var day = asDay(actual);
      var from = asDay(rule.value);
      if (!day || !from) return false;
      if (op === 'dateOn') return day === from;
      if (op === 'dateBefore') return day < from;
      if (op === 'dateAfter') return day > from;
      var to = asDay(rule.value2);
      if (!to) return false;
      var lo = from < to ? from : to, hi = from < to ? to : from;
      return day >= lo && day <= hi;
    }
    // `resolved` is set by resolveRules: the highest (or lowest) of the rows.
    case 'isHighest': case 'isLowest': {
      var r = asNumber(rule.resolved);
      return a !== null && r !== null && a === r;
    }
    case 'startsWith': return asText(actual).indexOf(asText(rule.value)) === 0;
    case 'endsWith': {
      var t = asText(actual);
      var n = asText(rule.value);
      return n.length <= t.length && t.lastIndexOf(n) === t.length - n.length;
    }
    // An operator nobody implements is not a match. Silently treating it as
    // one would style rows for a condition that was never evaluated.
    default: return false;
  }
}

/**
 * Rules made ready for these rows: an operator about ALL the rows ("is the
 * highest") gets the answer it needs, as `resolved`. Every other rule is
 * returned as it is. Call once per set of rows, before matching.
 *
 * @param {object[]} rules
 * @param {object[]} rows
 * @param {(rule, row) => any} valueOf  the value a rule tests, in a row
 * @returns {object[]} new rule objects where something was resolved
 */
function resolveRules(rules, rows, valueOf) {
  return (rules || []).map(function (rule) {
    var o = rule && BY_KEY[rule.op];
    if (!o || !o.needsRows) return rule;
    var best = null;
    (rows || []).forEach(function (row) {
      var n = asNumber(valueOf(rule, row));
      if (n === null) return;
      if (best === null || (rule.op === 'isHighest' ? n > best : n < best)) best = n;
    });
    return Object.assign({}, rule, { resolved: best });
  });
}

/** The first rule that matches, or null. The convention every caller follows. */
function firstMatch(rules, valueOf) {
  var list = rules || [];
  for (var i = 0; i < list.length; i++) {
    if (matches(list[i], valueOf(list[i]))) return list[i];
  }
  return null;
}

/**
 * The `then` of the first rule that matches — the whole of what a DOM surface
 * needs from this package.
 *
 * A chart has to compile rules into ECharts callbacks because it draws its own
 * marks. Everything else — a table cell, a metric, a label, an arrow — is a
 * DOM node with a style on it, and for those "which rule won, and what did it
 * ask for" IS the applier. There is nothing more to build.
 *
 * `valueOf(rule)` is how the caller says where a rule's field is read from: a
 * row for a table, the board's parameter scope for a label, the widget's one
 * row for a metric. The condition never needs to know.
 *
 * Returns null when nothing matched, so a caller can tell "no rule applied"
 * from "a rule applied and asked for nothing".
 */
function resolveThen(rules, valueOf) {
  var hit = firstMatch(rules, valueOf);
  return hit ? (hit.then || {}) : null;
}

// ── formatting a value ───────────────────────────────────────────────────

/**
 * A number, as a person should read it.
 *
 * Here rather than in a renderer because "two decimals, in pounds" is the
 * same instruction wherever it lands, and Intl is the only sane implementation
 * of it — currency symbols, grouping separators and negative conventions all
 * differ by locale and are not worth reimplementing per surface.
 *
 * Anything that is not a number comes back null, so a caller can leave a
 * category name alone rather than printing NaN over it.
 */
function formatNumber(value, f) {
  if (!f) return null;
  var n = asNumber(value);
  if (n === null) return null;
  var style = f.style || 'decimal';
  var opts = { useGrouping: f.useGrouping !== false };
  if (style === 'currency') { opts.style = 'currency'; opts.currency = f.currency || 'USD'; }
  else if (style === 'percent') opts.style = 'percent';
  else opts.style = 'decimal';
  if (f.decimals != null && isFinite(Number(f.decimals))) {
    opts.minimumFractionDigits = Number(f.decimals);
    opts.maximumFractionDigits = Number(f.decimals);
  }
  var out;
  try { out = new Intl.NumberFormat(f.locale || undefined, opts).format(n); }
  catch (e) { out = String(n); }
  return (f.prefix || '') + out + (f.suffix || '');
}

/**
 * Whether a column can answer a numeric comparison, judged from its values.
 *
 * From the ROWS rather than a schema, because the rows are what will actually
 * be tested. Numeric strings count. Blanks say nothing either way — a column
 * is not text because some of it is empty.
 */
function columnIsNumeric(rows, key, sampleSize) {
  var sample = (rows || []).slice(0, sampleSize || 20);
  var sawValue = false;
  for (var i = 0; i < sample.length; i++) {
    var v = sample[i] ? sample[i][key] : undefined;
    if (isBlank(v)) continue;
    sawValue = true;
    if (asNumber(v) === null) return false;
  }
  // Nothing to judge on: offer everything and let the renderer report a rule
  // that turns out not to fit.
  return sawValue || !sample.length;
}

/**
 * What kind of value a column holds, judged from its values: 'number' when
 * every one is a number (numeric strings count), 'date' when every one is a
 * day or an ISO stamp, 'text' otherwise — or null with nothing to judge on.
 * A guess for which group a picker leads with, never a limit on it.
 */
function columnKind(rows, key, sampleSize) {
  var sample = (rows || []).slice(0, sampleSize || 20);
  var number = true, date = true, saw = false;
  for (var i = 0; i < sample.length; i++) {
    var v = sample[i] ? sample[i][key] : undefined;
    if (isBlank(v)) continue;
    saw = true;
    if (asNumber(v) === null) number = false;
    if (!asDay(v)) date = false;
  }
  if (!saw) return null;
  return number ? 'number' : date ? 'date' : 'text';
}

module.exports = {
  resolveRules: resolveRules,
  OPERATORS: OPERATORS,
  OPERATOR_GROUPS: OPERATOR_GROUPS,
  operatorGroups: operatorGroups,
  defaultOperator: defaultOperator,
  columnKind: columnKind,
  operator: operator,
  operatorsFor: operatorsFor,
  matches: matches,
  firstMatch: firstMatch,
  resolveThen: resolveThen,
  formatNumber: formatNumber,
  columnIsNumeric: columnIsNumeric
};

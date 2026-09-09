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

var OPERATORS = [
  { key: 'lt', label: 'is less than', numeric: true },
  { key: 'lte', label: 'is at most', numeric: true },
  { key: 'gt', label: 'is more than', numeric: true },
  { key: 'gte', label: 'is at least', numeric: true },
  { key: 'between', label: 'is between', numeric: true, second: true },
  { key: 'eq', label: 'is' },
  { key: 'neq', label: 'is not' },
  { key: 'contains', label: 'contains' },
  { key: 'startsWith', label: 'starts with' },
  { key: 'endsWith', label: 'ends with' },
  { key: 'isEmpty', label: 'is blank', noValue: true },
  { key: 'notEmpty', label: 'is not blank', noValue: true }
];

var BY_KEY = {};
OPERATORS.forEach(function (o) { BY_KEY[o.key] = o; });

function operator(key) { return BY_KEY[key] || null; }

/** The operators worth offering for a column — numeric ones only where they can answer. */
function operatorsFor(isNumeric) {
  return isNumeric ? OPERATORS.slice() : OPERATORS.filter(function (o) { return !o.numeric; });
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

module.exports = {
  OPERATORS: OPERATORS,
  operator: operator,
  operatorsFor: operatorsFor,
  matches: matches,
  firstMatch: firstMatch,
  resolveThen: resolveThen,
  formatNumber: formatNumber,
  columnIsNumeric: columnIsNumeric
};

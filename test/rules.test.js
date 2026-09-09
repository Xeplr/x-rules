// The condition language, on its own.
//
// This is the half of conditional formatting that every renderer shares — a
// chart, a table, a metric and an arrow all ask the same question and only
// differ in what they do about the answer. So it is tested without any of
// them present, which is also the point of the package existing.

var test = require('node:test');
var assert = require('node:assert');
var R = require('../index.js');

test('numeric comparisons, over numbers', function () {
  [
    [{ op: 'lt', value: 5 }, 3, true], [{ op: 'lt', value: 5 }, 7, false],
    [{ op: 'lte', value: 5 }, 5, true], [{ op: 'gt', value: 5 }, 7, true],
    [{ op: 'gte', value: 5 }, 5, true],
    [{ op: 'between', value: 0, value2: 10 }, 7, true],
    [{ op: 'between', value: 10, value2: 0 }, 7, true],   // given backwards
    [{ op: 'between', value: 0, value2: 10 }, 11, false]
  ].forEach(function (c) {
    assert.strictEqual(R.matches(c[0], c[1]), c[2], JSON.stringify(c[0]) + ' vs ' + c[1]);
  });
});

test('...and over numbers that arrived as strings', function () {
  // Several drivers return a decimal as a string. Refusing to compare it
  // would hide exactly the columns most likely to want a rule.
  assert.strictEqual(R.matches({ op: 'gt', value: 1 }, '2.5'), true);
  assert.strictEqual(R.matches({ op: 'gt', value: 1 }, '0.5'), false);
  assert.strictEqual(R.matches({ op: 'lt', value: 5 }, '3'), true);
});

test('a numeric comparison over text is not a match', function () {
  // Not an error and not true — a question with no answer.
  assert.strictEqual(R.matches({ op: 'gt', value: 5 }, 'IPD'), false);
  assert.strictEqual(R.matches({ op: 'between', value: 0, value2: 9 }, 'IPD'), false);
});

test('text comparisons', function () {
  [
    [{ op: 'eq', value: 'IPD' }, 'IPD', true],
    [{ op: 'eq', value: 'ipd' }, 'IPD', true],          // case does not decide it
    [{ op: 'neq', value: 'IPD' }, 'OPD', true],
    [{ op: 'contains', value: 'PD' }, 'IPD', true],
    [{ op: 'startsWith', value: 'I' }, 'IPD', true],
    [{ op: 'startsWith', value: 'P' }, 'IPD', false],
    [{ op: 'endsWith', value: 'PD' }, 'IPD', true],
    [{ op: 'endsWith', value: 'IPD' }, 'PD', false]     // longer needle than haystack
  ].forEach(function (c) {
    assert.strictEqual(R.matches(c[0], c[1]), c[2], JSON.stringify(c[0]) + ' vs ' + c[1]);
  });
});

test('equality is numeric when both sides are', function () {
  // "is 0" also matches "0.0" and the string "0" — one setting, not three.
  assert.strictEqual(R.matches({ op: 'eq', value: 0 }, '0'), true);
  assert.strictEqual(R.matches({ op: 'eq', value: 0 }, '0.0'), true);
  assert.strictEqual(R.matches({ op: 'eq', value: '10' }, 10), true);
});

test('blankness', function () {
  [null, undefined, '', '   '].forEach(function (v) {
    assert.strictEqual(R.matches({ op: 'isEmpty' }, v), true, JSON.stringify(v));
    assert.strictEqual(R.matches({ op: 'notEmpty' }, v), false, JSON.stringify(v));
  });
  // Zero is a value, not an absence — the mistake that hides every zero row.
  assert.strictEqual(R.matches({ op: 'isEmpty' }, 0), false);
  assert.strictEqual(R.matches({ op: 'notEmpty' }, 0), true);
});

test('an operator nobody implements is not a match', function () {
  // Treating it as one would style rows for a condition never evaluated.
  assert.strictEqual(R.matches({ op: 'nonsense', value: 1 }, 1), false);
  assert.strictEqual(R.matches({}, 1), false);
  assert.strictEqual(R.matches(null, 1), false);
});

test('the operators are data, so a picker can be built from them', function () {
  assert.strictEqual(R.OPERATORS.length, 12);
  assert.ok(R.OPERATORS.every(function (o) { return o.key && o.label; }));
  assert.strictEqual(R.operator('lt').numeric, true);
  assert.strictEqual(R.operator('contains').numeric, undefined);
  assert.strictEqual(R.operator('between').second, true);
  assert.strictEqual(R.operator('isEmpty').noValue, true);
  assert.strictEqual(R.operator('nope'), null);
});

test('...and which ones a column can answer', function () {
  var numeric = R.operatorsFor(true).map(function (o) { return o.key; });
  var text = R.operatorsFor(false).map(function (o) { return o.key; });
  assert.ok(numeric.indexOf('lt') >= 0 && numeric.indexOf('between') >= 0);
  // Offering "is more than" on a column of names is a control that can never
  // be true.
  assert.strictEqual(text.indexOf('lt'), -1);
  assert.strictEqual(text.indexOf('between'), -1);
  assert.ok(['eq', 'neq', 'contains', 'startsWith', 'endsWith', 'isEmpty'].every(function (k) {
    return text.indexOf(k) >= 0;
  }));
});

test('first match wins, and it is the caller that says what "first" means', function () {
  var rules = [
    { field: 'm', op: 'lt', value: 10 },
    { field: 'm', op: 'lt', value: 0 }
  ];
  var row = { m: -4 };
  // Both match; the first is returned.
  assert.strictEqual(R.firstMatch(rules, function (r) { return row[r.field]; }), rules[0]);
  assert.strictEqual(R.firstMatch(rules, function () { return 50; }), null);
  assert.strictEqual(R.firstMatch(undefined, function () { return 1; }), null);
});

test('formatting a number', function () {
  assert.strictEqual(R.formatNumber(1234.5, { decimals: 2 }), '1,234.50');
  assert.strictEqual(R.formatNumber(1234.5, { decimals: 0, useGrouping: false }), '1235');
  assert.strictEqual(R.formatNumber(1234.5, { style: 'currency', currency: 'USD', decimals: 2 }), '$1,234.50');
  assert.strictEqual(R.formatNumber(0.185, { style: 'percent', decimals: 1 }), '18.5%');
  assert.strictEqual(R.formatNumber(12, { decimals: 0, prefix: '~', suffix: ' units' }), '~12 units');
});

test('...and leaving alone what is not one', function () {
  // So a caller can print a category name rather than NaN over it.
  assert.strictEqual(R.formatNumber('IPD', { decimals: 2 }), null);
  assert.strictEqual(R.formatNumber(null, { decimals: 2 }), null);
  assert.strictEqual(R.formatNumber(5, null), null);      // no format asked for
});

test('whether a column can answer a numeric comparison', function () {
  var rows = [
    { n: 1, s: 'a', mixed: 1, ratio: '1.5', blank: null },
    { n: 2, s: 'b', mixed: 'x', ratio: '2.0', blank: null }
  ];
  assert.strictEqual(R.columnIsNumeric(rows, 'n'), true);
  assert.strictEqual(R.columnIsNumeric(rows, 's'), false);
  assert.strictEqual(R.columnIsNumeric(rows, 'ratio'), true);   // numeric strings count
  assert.strictEqual(R.columnIsNumeric(rows, 'mixed'), false);  // one text value decides it
  // Blanks say nothing either way; a column that is empty throughout has
  // nothing to judge on and no rule on it could fire anyway.
  assert.strictEqual(R.columnIsNumeric(rows, 'blank'), false);
  // No rows at all: offer everything rather than hiding half the panel.
  assert.strictEqual(R.columnIsNumeric([], 'anything'), true);
  assert.strictEqual(R.columnIsNumeric(undefined, 'anything'), true);
});

test('it depends on nothing', function () {
  // The whole reason the package exists. A table asking "is this less than
  // zero" must not have to import a charting library to find out.
  var src = require('node:fs').readFileSync(require.resolve('../src/rules.js'), 'utf8');
  assert.strictEqual(/\brequire\s*\(/.test(src), false, 'src/rules.js must have no requires');
  assert.strictEqual(/\bimport\s/.test(src), false, 'src/rules.js must have no imports');
});

test('resolveThen is the whole applier for anything that is not a chart', function () {
  // A chart compiles rules into ECharts callbacks because it draws its own
  // marks. A table cell, a metric, a label and an arrow are DOM nodes with a
  // style on them — for those, "which rule won and what did it ask for" is
  // the entire job.
  var rules = [
    { field: 'margin', op: 'lt', value: 0, then: { color: '#c00', fontWeight: 'bold' } },
    { field: 'margin', op: 'gt', value: 10, then: { color: '#0a0' } }
  ];
  var of = function (row) { return function (rule) { return row[rule.field]; }; };

  assert.deepStrictEqual(R.resolveThen(rules, of({ margin: -4 })), { color: '#c00', fontWeight: 'bold' });
  assert.deepStrictEqual(R.resolveThen(rules, of({ margin: 12 })), { color: '#0a0' });
  // Nothing matched — distinguishable from a rule that matched and asked for
  // nothing, which is a real difference to a caller merging styles.
  assert.strictEqual(R.resolveThen(rules, of({ margin: 5 })), null);
  assert.deepStrictEqual(R.resolveThen([{ field: 'a', op: 'gt', value: 0, then: {} }], of({ a: 1 })), {});
  assert.strictEqual(R.resolveThen([], of({})), null);
  assert.strictEqual(R.resolveThen(undefined, of({})), null);
});

test('...and the caller decides where a field is READ from', function () {
  // The condition never needs to know. A table reads a row; a label reads the
  // board's parameter scope, where the names carry a colon.
  var rules = [{ field: ':region', op: 'eq', value: 'North', then: { color: '#c00' } }];
  var scope = { ':region': 'North' };
  assert.deepStrictEqual(
    R.resolveThen(rules, function (rule) { return scope[rule.field]; }),
    { color: '#c00' }
  );
});

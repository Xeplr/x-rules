// @xeplr/rules — conditional formatting, as a condition language.
//
//   const { matches, OPERATORS } = require('@xeplr/rules');
//   import { matches } from '@xeplr/rules'
//
// "When margin is under zero" is the same question whether the answer paints a
// bar, a table cell, a metric or an arrow. This package owns that question and
// nothing else — what to DO about a match belongs to whatever is drawing.
//
// A STATIC OBJECT LITERAL, not `module.exports = require(…)` and not
// `exports.x = …`. Both are equivalent in Node and invisible to Rollup, which
// analyses CommonJS statically: named imports failed at build time while
// working perfectly under test. This is the form a bundler can read, and it is
// why @xeplr/ui-charts' own barrel is written the same way.
var R = require('./src/rules.js');

module.exports = {
  // The comparisons, as DATA — so a picker can be built from them and a caller
  // can tell which ones a column supports without a second list to keep in step.
  OPERATORS: R.OPERATORS,
  operator: R.operator,
  operatorsFor: R.operatorsFor,

  // The question itself. Pure, total, dependency-free.
  matches: R.matches,
  firstMatch: R.firstMatch,
  resolveThen: R.resolveThen,

  // Value formatting, shared for the same reason: "two decimals, in pounds" is
  // the same instruction wherever it lands.
  formatNumber: R.formatNumber,
  columnIsNumeric: R.columnIsNumeric
};

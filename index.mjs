// The ESM face of this package.
//
// The source is CommonJS because @xeplr/ui-charts is, and it `require`s this.
// But named imports from a CommonJS module are guesswork: Node's lexer and
// Rollup's analyser each scan the source for patterns, and both missed
// exports here that the other found — `columnIsNumeric` resolved in a bundle
// and threw under test.
//
// So the guessing is removed. `import` gets this file, which has real ESM
// exports; `require` gets index.js, which has real CommonJS ones. One source
// of truth underneath both, and no consumer has to know which it got.
import R from './src/rules.js'

export const OPERATORS = R.OPERATORS
export const operator = R.operator
export const operatorsFor = R.operatorsFor
export const matches = R.matches
export const firstMatch = R.firstMatch
export const resolveThen = R.resolveThen
export const formatNumber = R.formatNumber
export const columnIsNumeric = R.columnIsNumeric

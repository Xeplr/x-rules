# @xeplr/rules

**Conditional formatting, as a condition language.** A rule says *"when margin is under zero"*; this package answers whether a rule matches a value, picks the first rule that matches, and formats numbers. What to **do** about a match — colour a bar, shade a table cell, style a metric — belongs to whatever is drawing, and is not interpreted here.

Use it anywhere a condition on data has to drive presentation: `@xeplr/ui-charts` compiles rules into chart callbacks, and a table cell, label or metric can use `resolveThen` directly. It has no dependencies, so a table asking "is this less than zero" does not have to import a charting library.

## Install

```sh
npm i @xeplr/rules
```

No dependencies, no peers. Ships CommonJS and ESM entry points.

## Quick start

```js
import { resolveThen, formatNumber } from '@xeplr/rules'

const rules = [
  { field: 'margin', op: 'lt', value: 0,  then: { color: '#c00', fontWeight: 'bold' } },
  { field: 'margin', op: 'gt', value: 10, then: { color: '#0a0' } }
]
const readFrom = (row) => (rule) => row[rule.field]

resolveThen(rules, readFrom({ margin: -4 }))   // → { color: '#c00', fontWeight: 'bold' }
resolveThen(rules, readFrom({ margin: 12 }))   // → { color: '#0a0' }
resolveThen(rules, readFrom({ margin: 5 }))    // → null   (nothing matched)

formatNumber(1234.5, { style: 'currency', currency: 'USD', decimals: 2 })   // → '$1,234.50'
```

## API

| export | signature | does |
|---|---|---|
| `OPERATORS` | `Array<{ key, label, numeric?, second?, noValue? }>` | The 12 operators, as data. |
| `operator` | `(key) → operator \| null` | The `OPERATORS` entry for a key, or `null`. |
| `operatorsFor` | `(isNumeric) → operator[]` | All operators when `true`; only the non-`numeric` ones when `false`. Always a new array. |
| `matches` | `(rule, actual) → boolean` | Whether `rule` matches the value `actual`. Never throws. |
| `firstMatch` | `(rules, valueOf) → rule \| null` | The first rule in `rules` for which `matches(rule, valueOf(rule))` is true. |
| `resolveThen` | `(rules, valueOf) → object \| null` | The first match's `then` (`{}` if it has none), or `null` if nothing matched. |
| `formatNumber` | `(value, format) → string \| null` | A number formatted with `Intl.NumberFormat`; `null` for a non-number or no format. |
| `columnIsNumeric` | `(rows, key, sampleSize = 20) → boolean` | Whether a column's values can answer a numeric comparison, judged from the first `sampleSize` rows. |

`valueOf(rule)` is how the caller says where a rule's field is read from — a row for a table, a parameter scope for a label (`scope[':region']`), a widget's one row for a metric. The condition never needs to know.

## A rule

```js
{ field, op, value, value2?, target?, series?, then: { … } }
```

| key | read by this package | |
|---|---|---|
| `op` | yes | An operator key, below. |
| `value` | yes | What to compare against. Not used by `isEmpty` / `notEmpty`. |
| `value2` | yes | Second bound for `between`. |
| `then` | returned by `resolveThen` | What to do about a match. **Not interpreted** — its vocabulary belongs to the renderer. |
| `field` | no | The column to test — any column in the data, not only a displayed one. Your `valueOf` reads it. |
| `target`, `series` | no | Part of the rule shape for renderers; ignored here. |

## Operators

| key | label | flags | matches when |
|---|---|---|---|
| `lt` | is less than | `numeric` | both sides are numbers and `actual < value` |
| `lte` | is at most | `numeric` | … `actual <= value` |
| `gt` | is more than | `numeric` | … `actual > value` |
| `gte` | is at least | `numeric` | … `actual >= value` |
| `between` | is between | `numeric`, `second` | `actual`, `value` and `value2` are all numbers and `actual` is within them, inclusive. Bounds may be given in either order. |
| `eq` | is | | numbers: `actual === value`; otherwise case-insensitive text equality |
| `neq` | is not | | the negation of `eq` |
| `contains` | contains | | case-insensitive substring |
| `startsWith` | starts with | | case-insensitive prefix |
| `endsWith` | ends with | | case-insensitive suffix |
| `isEmpty` | is blank | `noValue` | `null`, `undefined`, or a string that is empty after trimming |
| `notEmpty` | is not blank | `noValue` | not blank |

Flags, for building a rule editor: `numeric` — only answers over numbers; `second` — needs `value2`; `noValue` — needs no `value`.

### How values are compared

| rule | effect |
|---|---|
| A value is a **number** if it is a finite `number`, or a non-blank string for which `Number(s)` is finite | `'2.5'`, `'0.0'`, `'1e3'` count; `NaN`, `Infinity`, `''` do not |
| Numeric operators need **both** sides to be numbers | `matches({ op: 'gt', value: 5 }, 'IPD')` → `false` — not an error, not true |
| `eq` / `neq` compare as numbers when both sides are | `{ op: 'eq', value: 0 }` matches `0`, `'0'` and `'0.0'` |
| Otherwise text: `null` / `undefined` become `''`, everything else `String(v).toLowerCase()` | `{ op: 'eq', value: 'ipd' }` matches `'IPD'`; `{ op: 'eq', value: '' }` matches `null` |
| `0` is not blank | `isEmpty` is `false` for `0` |
| Unknown `op`, a rule with no `op`, or no rule | `false` |

## `formatNumber(value, format)`

| `format` key | default | |
|---|---|---|
| `style` | `'decimal'` | `'decimal'`, `'currency'` or `'percent'` (anything else is treated as decimal) |
| `currency` | `'USD'` | ISO code, used when `style: 'currency'` |
| `decimals` | Intl's default | sets both minimum and maximum fraction digits |
| `useGrouping` | `true` | `false` to drop thousands separators |
| `locale` | runtime default | passed to `Intl.NumberFormat` |
| `prefix`, `suffix` | `''` | added around the formatted number |

```js
formatNumber(1234.5, { decimals: 2 })                                   // '1,234.50'
formatNumber(1234.5, { decimals: 0, useGrouping: false })               // '1235'
formatNumber(0.185, { style: 'percent', decimals: 1 })                  // '18.5%'   (percent multiplies by 100)
formatNumber(12, { decimals: 0, prefix: '~', suffix: ' units' })        // '~12 units'
formatNumber('IPD', { decimals: 2 })                                    // null
formatNumber(5, null)                                                   // null
```

Numeric strings are formatted like numbers. If `Intl.NumberFormat` throws (e.g. an invalid currency code), the result is `String(n)` with prefix and suffix.

## `columnIsNumeric(rows, key, sampleSize)`

Looks at `rows.slice(0, sampleSize || 20)`:

| sample | result |
|---|---|
| every non-blank value is a number (numeric strings count) | `true` |
| any non-blank value is not a number | `false` |
| rows present, but every value blank | `false` |
| no rows (`[]`, `undefined`) | `true` — offer every operator rather than hiding half the panel |

Pair it with `operatorsFor(columnIsNumeric(rows, key))` to build the operator picker.

## Errors

Nothing in this package throws on bad input. `matches` is total: a missing rule, an unknown operator or a non-numeric value in a numeric comparison is `false`. `firstMatch` / `resolveThen` accept `undefined` for `rules`. `formatNumber` returns `null` rather than `NaN`.

## CommonJS / ESM

`package.json` `exports` sends each loader to a file with real exports of its kind:

| | resolves to |
|---|---|
| `require('@xeplr/rules')` | `index.js` |
| `import … from '@xeplr/rules'` | `index.mjs` (also `module`) |

```js
const { matches, OPERATORS } = require('@xeplr/rules')
```

```js
import { matches, OPERATORS } from '@xeplr/rules'
```

Both re-export one source, `src/rules.js`. There is no default export on the ESM side.

## Rules the code enforces

| rule | why |
|---|---|
| `then` is never interpreted | A chart sets ECharts channels, a table sets CSS, a DOM widget sets a style object — none share an implementation. Only the target knows what a legal property is. |
| First matching rule wins | The convention every caller follows (`firstMatch`). The order of the list is the caller's decision. |
| `resolveThen` returns `null` for no match, `{}` for a match with no `then` | A caller merging styles needs to tell "no rule applied" from "a rule applied and asked for nothing". |
| Operators are data, flagged `numeric` | A UI builds its picker from them without a second list to keep in step, and does not offer "is more than" on a column of names — a control that can never be true. |
| Numeric when both sides are numbers, text otherwise | Several database drivers return decimals as strings; refusing to compare them would hide exactly the columns most likely to want a rule. |
| An unimplemented operator is not a match | Treating it as one would style rows for a condition that was never evaluated. |
| Blank is `null`, `undefined` or whitespace — not `0` | Treating zero as absent hides every zero row. |
| `columnIsNumeric` judges from rows, not a schema | The rows are what will actually be tested. Blanks say nothing either way. |
| `formatNumber` lives here and uses `Intl` | "Two decimals, in pounds" is the same instruction wherever it lands; currency symbols, grouping and negatives differ by locale and are not worth reimplementing per surface. |
| `src/rules.js` has no `require` or `import` (a test asserts it) | The package exists so any renderer can import it without dragging anything along. |
| `index.js` is a static object literal; `index.mjs` has real ESM exports | Rollup and Node's lexer each guess CommonJS named exports differently — named imports failed in a bundle while passing under test, and vice versa. Separate entries remove the guessing. |

## Tests

```sh
npm test
```

Runs `node --test test/*.test.js` — 16 tests with Node's built-in runner, no dependencies.

## License

MIT

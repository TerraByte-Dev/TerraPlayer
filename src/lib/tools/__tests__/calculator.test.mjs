import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluate, formatResult, tokenize, toRPN } from '../calculator.ts'

const EPS = 1e-9

test('precedence: 2+3*4 = 14', () => {
  assert.equal(evaluate('2+3*4'), 14)
})

test('precedence: 2*3+4 = 10', () => {
  assert.equal(evaluate('2*3+4'), 10)
})

test('parentheses override precedence: (2+3)*4 = 20', () => {
  assert.equal(evaluate('(2+3)*4'), 20)
})

test('nested parentheses: ((1+2)*(3+4)) = 21', () => {
  assert.equal(evaluate('((1+2)*(3+4))'), 21)
})

test('decimals: 0.1 + 0.2 within epsilon of 0.3', () => {
  assert.ok(Math.abs(evaluate('0.1+0.2') - 0.3) < EPS)
})

test('leading-dot decimals: .5 + .25 = 0.75', () => {
  assert.equal(evaluate('.5+.25'), 0.75)
})

test('unary minus: -3+2 = -1', () => {
  assert.equal(evaluate('-3+2'), -1)
})

test('unary minus inside parens: (-3+2) = -1', () => {
  assert.equal(evaluate('(-3+2)'), -1)
})

test('double unary minus: --3 = 3', () => {
  assert.equal(evaluate('--3'), 3)
})

test('unary minus binds looser than exponent: -2^2 = -4', () => {
  assert.equal(evaluate('-2^2'), -4)
})

test('unary plus: +5 = 5', () => {
  assert.equal(evaluate('+5'), 5)
})

test('unary minus on right operand of ^: 2^-2 = 0.25', () => {
  assert.equal(evaluate('2^-2'), 0.25)
})

test('percent as /100: 50% = 0.5', () => {
  assert.equal(evaluate('50%'), 0.5)
})

test('percent in product: 200*10% = 20', () => {
  assert.equal(evaluate('200*10%'), 20)
})

test('percent with addition precedence: 100+50% = 100.5', () => {
  // % binds to its immediate operand: 100 + (50/100)
  assert.equal(evaluate('100+50%'), 100.5)
})

test('exponent: 2^10 = 1024', () => {
  assert.equal(evaluate('2^10'), 1024)
})

test('exponent is right-associative: 2^3^2 = 512', () => {
  assert.equal(evaluate('2^3^2'), 512)
})

test('exponent over multiplication: 3*2^3 = 24', () => {
  assert.equal(evaluate('3*2^3'), 24)
})

test('subtraction is left-associative: 10-3-2 = 5', () => {
  assert.equal(evaluate('10-3-2'), 5)
})

test('division is left-associative: 100/5/2 = 10', () => {
  assert.equal(evaluate('100/5/2'), 10)
})

test('whitespace is ignored: " 2 +  3 * 4 " = 14', () => {
  assert.equal(evaluate(' 2 +  3 * 4 '), 14)
})

test('0^0 follows Math.pow semantics === 1', () => {
  assert.equal(evaluate('0^0'), 1)
})

test('fractional exponent: 9^0.5 = 3', () => {
  assert.ok(Math.abs(evaluate('9^0.5') - 3) < EPS)
})

// --- Divide-by-zero behavior (documented: throws) ---

test('divide by zero throws', () => {
  assert.throws(() => evaluate('1/0'), /Division by zero/)
})

test('divide by zero via parens throws', () => {
  assert.throws(() => evaluate('5/(3-3)'), /Division by zero/)
})

test('0/0 throws (not NaN)', () => {
  assert.throws(() => evaluate('0/0'), /Division by zero/)
})

// --- Malformed / edge cases throw ---

test('empty string throws', () => {
  assert.throws(() => evaluate(''), /Empty/)
})

test('whitespace-only string throws', () => {
  assert.throws(() => evaluate('   '), /Empty/)
})

test('unmatched opening paren throws', () => {
  assert.throws(() => evaluate('(2+3'), /[Pp]arenthes/)
})

test('unmatched closing paren throws', () => {
  assert.throws(() => evaluate('2+3)'), /[Pp]arenthes/)
})

test('trailing operator throws', () => {
  assert.throws(() => evaluate('2+'), /Malformed/)
})

test('leading binary operator throws', () => {
  assert.throws(() => evaluate('*2'), /Unexpected operator/)
})

test('consecutive binary operators throw', () => {
  assert.throws(() => evaluate('2**3'), /Unexpected operator/)
})

test('two numbers without operator throws', () => {
  assert.throws(() => evaluate('2 3'), /Malformed/)
})

test('unexpected character throws', () => {
  assert.throws(() => evaluate('2 & 3'), /Unexpected character/)
})

test('multiple decimal points in a number throws', () => {
  assert.throws(() => evaluate('1.2.3'), /Malformed number/)
})

test('lone decimal point throws', () => {
  assert.throws(() => evaluate('.'), /Malformed number/)
})

test('leading percent throws', () => {
  assert.throws(() => evaluate('%5'), /%/)
})

test('result Infinity from huge exponent throws as non-finite', () => {
  assert.throws(() => evaluate('10^1000'), /finite/)
})

// --- formatResult ---

test('formatResult trims float noise: 0.1+0.2 -> "0.3"', () => {
  assert.equal(formatResult(evaluate('0.1+0.2')), '0.3')
})

test('formatResult integer stays clean', () => {
  assert.equal(formatResult(1024), '1024')
})

test('formatResult strips trailing zeros: 2.50 -> "2.5"', () => {
  assert.equal(formatResult(2.5), '2.5')
})

test('formatResult normalizes -0 to "0"', () => {
  assert.equal(formatResult(-0), '0')
})

test('formatResult negative numbers', () => {
  assert.equal(formatResult(-3), '-3')
})

test('formatResult uses exponential for very large magnitudes', () => {
  const s = formatResult(1e20)
  assert.match(s, /e/)
})

test('formatResult throws on non-finite', () => {
  assert.throws(() => formatResult(Infinity), /finite/)
  assert.throws(() => formatResult(NaN), /finite/)
})

// --- tokenize / toRPN building blocks ---

test('tokenize produces expected token types', () => {
  const toks = tokenize('-2+3%')
  assert.deepEqual(
    toks.map((t) => t.type),
    ['op', 'num', 'op', 'num', 'percent'],
  )
})

test('toRPN converts 2+3*4 correctly', () => {
  const rpn = toRPN(tokenize('2+3*4'))
  assert.deepEqual(
    rpn.map((t) => t.value),
    ['2', '3', '4', '*', '+'],
  )
})

test('toRPN marks unary minus as u-', () => {
  const rpn = toRPN(tokenize('-3'))
  assert.deepEqual(
    rpn.map((t) => t.value),
    ['3', 'u-'],
  )
})

// Exponent-notation round-trip: formatResult() emits "1e15"-style strings for very large/small results,
// and the UI feeds a result back in as the next operand, so tokenize() must accept exponent syntax.
test('tokenize: reads exponent notation', () => {
  assert.deepEqual(tokenize('1e15'), [{ type: 'num', value: '1e15' }])
  assert.deepEqual(tokenize('2.5E-3'), [{ type: 'num', value: '2.5E-3' }])
})

test('evaluate: exponential-notation operands round-trip', () => {
  assert.equal(evaluate('1e15*2'), 2e15)
  assert.equal(evaluate('1.5e15+0'), 1.5e15)
  assert.ok(Math.abs(evaluate('2.5e-3+0') - 0.0025) < EPS)
})

test('evaluate: a formatResult() output is re-parseable (the chaining bug)', () => {
  const r = formatResult(1e9 * 1e6) // -> "1e15"
  assert.equal(evaluate(`${r}*2`), 2e15)
})

test('evaluate: malformed exponent (no digits) throws', () => {
  assert.throws(() => evaluate('1e'))
  assert.throws(() => evaluate('1e+'))
})

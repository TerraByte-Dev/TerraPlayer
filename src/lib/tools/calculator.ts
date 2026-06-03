// Safe arithmetic expression evaluator for the Calculator tool.
//
// No eval / no Function constructor — the expression is tokenized, converted to Reverse Polish Notation
// via the shunting-yard algorithm, then evaluated off an explicit stack. This file is self-contained
// (no imports) and pure (no DOM / React) so it can be unit-tested in isolation.
//
// Supported grammar:
//   numbers      decimals + integers, e.g. 3, 0.5, .5, 12.75
//   operators    +  -  *  /  ^ (exponent, right-associative)
//   percent      n%  ->  n / 100  (postfix, e.g. 200 * 10%  ==  200 * 0.1  ==  20)
//   unary minus  -3  ->  negate    (also unary plus, +3 -> 3)
//   parentheses  ( )  for grouping
//
// Divide-by-zero behavior: division (or modulo-style) by zero throws an Error rather than yielding
// Infinity/NaN. A calculator surfacing "Infinity" is confusing; an explicit error is clearer and is
// rendered as the ERR state by the component. 0 ^ 0 follows JS Math semantics (=== 1).

export type TokenType = 'num' | 'op' | 'lparen' | 'rparen' | 'percent'

export interface Token {
  type: TokenType
  value: string
}

const OPERATORS: Record<string, { prec: number; rightAssoc: boolean }> = {
  '+': { prec: 2, rightAssoc: false },
  '-': { prec: 2, rightAssoc: false },
  '*': { prec: 3, rightAssoc: false },
  '/': { prec: 3, rightAssoc: false },
  // Exponent binds tighter than binary +-*/.
  '^': { prec: 4, rightAssoc: true },
  // Unary minus/plus share exponent's precedence and are right-associative. This makes
  // -2^2 === -(2^2) === -4 (the ^ is emitted before the trailing u-) while 2^-2 === 0.25 still
  // parses (a unary on the right operand of ^ is not popped because of right-associativity).
  'u-': { prec: 4, rightAssoc: true },
  'u+': { prec: 4, rightAssoc: true },
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

/** Split a raw expression string into tokens. Throws on any unrecognized character. */
export function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = expr.length

  while (i < n) {
    const ch = expr[i]

    // Whitespace is insignificant.
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i++
      continue
    }

    // Number: a run of digits with at most one decimal point, plus optional exponent (e.g. 1e15, 2.5E-3).
    // Exponent support matters because formatResult() emits exponential notation for very large/small
    // results, and the UI feeds a result back in as the next operand — so our own output must round-trip.
    if (isDigit(ch) || ch === '.') {
      let num = ''
      let seenDot = false
      while (i < n && (isDigit(expr[i]) || expr[i] === '.')) {
        if (expr[i] === '.') {
          if (seenDot) throw new Error(`Malformed number: multiple decimal points near "${num}."`)
          seenDot = true
        }
        num += expr[i]
        i++
      }
      if (num === '.') throw new Error('Malformed number: lone decimal point')
      // Optional exponent: e/E, optional sign, then at least one digit.
      if (i < n && (expr[i] === 'e' || expr[i] === 'E')) {
        let exp = expr[i]
        i++
        if (i < n && (expr[i] === '+' || expr[i] === '-')) { exp += expr[i]; i++ }
        if (i >= n || !isDigit(expr[i])) throw new Error(`Malformed number: exponent has no digits near "${num}${exp}"`)
        while (i < n && isDigit(expr[i])) { exp += expr[i]; i++ }
        num += exp
      }
      tokens.push({ type: 'num', value: num })
      continue
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen', value: ch })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ch })
      i++
      continue
    }
    if (ch === '%') {
      tokens.push({ type: 'percent', value: ch })
      i++
      continue
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'op', value: ch })
      i++
      continue
    }

    throw new Error(`Unexpected character "${ch}" at position ${i}`)
  }

  return tokens
}

/**
 * Convert an infix token stream to RPN (Reverse Polish Notation) using the shunting-yard algorithm.
 * Resolves unary +/- based on context, applies the postfix percent as a unary operator, and validates
 * parenthesis matching.
 */
export function toRPN(tokens: Token[]): Token[] {
  const output: Token[] = []
  const stack: Token[] = []

  // Tracks whether the previous *significant* token allows a unary operator to follow. A unary
  // operator appears at the start, after another operator, after a left paren, or after a unary marker.
  let expectOperand = true

  for (const tok of tokens) {
    switch (tok.type) {
      case 'num': {
        output.push(tok)
        expectOperand = false
        break
      }
      case 'op': {
        let opVal = tok.value
        if (expectOperand && (opVal === '-' || opVal === '+')) {
          // Unary context.
          opVal = opVal === '-' ? 'u-' : 'u+'
        } else if (expectOperand) {
          throw new Error(`Unexpected operator "${opVal}"`)
        }
        const o1 = OPERATORS[opVal]
        while (stack.length > 0) {
          const top = stack[stack.length - 1]
          if (top.type !== 'op') break
          const o2 = OPERATORS[top.value]
          if (
            (o1.rightAssoc && o1.prec < o2.prec) ||
            (!o1.rightAssoc && o1.prec <= o2.prec)
          ) {
            output.push(stack.pop()!)
          } else {
            break
          }
        }
        stack.push({ type: 'op', value: opVal })
        expectOperand = true
        break
      }
      case 'percent': {
        if (expectOperand) throw new Error('Unexpected "%": nothing to take a percent of')
        // Postfix unary — emit immediately; it applies to the value already produced.
        output.push(tok)
        expectOperand = false
        break
      }
      case 'lparen': {
        stack.push(tok)
        expectOperand = true
        break
      }
      case 'rparen': {
        let foundLeft = false
        while (stack.length > 0) {
          const top = stack[stack.length - 1]
          if (top.type === 'lparen') {
            foundLeft = true
            break
          }
          output.push(stack.pop()!)
        }
        if (!foundLeft) throw new Error('Mismatched parentheses: unexpected ")"')
        stack.pop() // discard the left paren
        expectOperand = false
        break
      }
    }
  }

  while (stack.length > 0) {
    const top = stack.pop()!
    if (top.type === 'lparen' || top.type === 'rparen') {
      throw new Error('Mismatched parentheses: unclosed "("')
    }
    output.push(top)
  }

  return output
}

/** Evaluate an RPN token stream to a single number. Throws on malformed structure or divide-by-zero. */
export function evalRPN(rpn: Token[]): number {
  const stack: number[] = []

  for (const tok of rpn) {
    if (tok.type === 'num') {
      stack.push(parseFloat(tok.value))
      continue
    }
    if (tok.type === 'percent') {
      if (stack.length < 1) throw new Error('Malformed expression')
      stack.push(stack.pop()! / 100)
      continue
    }
    // Operator.
    if (tok.value === 'u-') {
      if (stack.length < 1) throw new Error('Malformed expression')
      stack.push(-stack.pop()!)
      continue
    }
    if (tok.value === 'u+') {
      if (stack.length < 1) throw new Error('Malformed expression')
      stack.push(+stack.pop()!)
      continue
    }
    if (stack.length < 2) throw new Error('Malformed expression')
    const b = stack.pop()!
    const a = stack.pop()!
    switch (tok.value) {
      case '+':
        stack.push(a + b)
        break
      case '-':
        stack.push(a - b)
        break
      case '*':
        stack.push(a * b)
        break
      case '/':
        if (b === 0) throw new Error('Division by zero')
        stack.push(a / b)
        break
      case '^':
        stack.push(Math.pow(a, b))
        break
      default:
        throw new Error(`Unknown operator "${tok.value}"`)
    }
  }

  if (stack.length !== 1) throw new Error('Malformed expression')
  const result = stack[0]
  if (!Number.isFinite(result)) throw new Error('Result is not a finite number')
  return result
}

/**
 * Evaluate an arithmetic expression string to a number.
 * Throws a clear Error on empty input, malformed input, mismatched parens, or divide-by-zero.
 */
export function evaluate(expr: string): number {
  if (expr == null || expr.trim() === '') throw new Error('Empty expression')
  const tokens = tokenize(expr)
  if (tokens.length === 0) throw new Error('Empty expression')
  const rpn = toRPN(tokens)
  return evalRPN(rpn)
}

/**
 * Format a numeric result for display: trims floating-point noise (e.g. 0.1 + 0.2 -> "0.3"),
 * avoids the "-0" artifact, and falls back to exponential notation for very large/small magnitudes.
 */
export function formatResult(n: number): string {
  if (!Number.isFinite(n)) throw new Error('Result is not a finite number')
  if (n === 0) return '0' // also normalizes -0 -> "0"

  const abs = Math.abs(n)
  // Outside the comfortable fixed-notation range, use compact exponential.
  if (abs >= 1e15 || abs < 1e-9) {
    return n.toExponential(6).replace(/\.?0+e/, 'e').replace('e+', 'e')
  }

  // Round to 12 significant-ish decimal places to kill binary float dust, then strip trailing zeros.
  let s = n.toPrecision(12)
  // toPrecision may emit exponential for some inputs; normalize back to plain via Number round-trip.
  if (s.includes('e') || s.includes('E')) s = String(Number(s))
  if (s.includes('.')) {
    s = s.replace(/0+$/, '').replace(/\.$/, '')
  }
  // Guard against producing "-0".
  if (s === '-0') s = '0'
  return s
}

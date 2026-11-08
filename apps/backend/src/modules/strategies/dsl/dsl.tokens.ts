export type TokenType =
  // Keywords
  | 'STRATEGY'
  | 'DESCRIPTION'
  | 'INSTRUMENT'
  | 'TIMEFRAME'
  | 'INDICATOR'
  | 'ENTRY'
  | 'EXIT'
  | 'RISK'
  | 'CROSSES_ABOVE'
  | 'CROSSES_BELOW'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'TRUE'
  | 'FALSE'
  // Built-in Series
  | 'SERIES'
  // Literals
  | 'NUMBER'
  | 'PERCENT'
  | 'STRING'
  | 'IDENTIFIER'
  // Symbols
  | 'ASSIGN' // =
  | 'COLON' // :
  | 'COMMA' // ,
  | 'LPAREN' // (
  | 'RPAREN' // )
  // Operators
  | 'PLUS' // +
  | 'MINUS' // -
  | 'MULTIPLY' // *
  | 'DIVIDE' // /
  | 'GT' // >
  | 'LT' // <
  | 'GTE' // >=
  | 'LTE' // <=
  | 'EQ' // ==
  | 'NEQ' // !=
  // Structure
  | 'NEWLINE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export const KEYWORDS: Record<string, TokenType> = {
  strategy: 'STRATEGY',
  description: 'DESCRIPTION',
  instrument: 'INSTRUMENT',
  timeframe: 'TIMEFRAME',
  indicator: 'INDICATOR',
  entry: 'ENTRY',
  exit: 'EXIT',
  risk: 'RISK',
  crosses_above: 'CROSSES_ABOVE',
  crosses_below: 'CROSSES_BELOW',
  and: 'AND',
  or: 'OR',
  not: 'NOT',
  true: 'TRUE',
  false: 'FALSE',
};

export const SERIES_KEYWORDS = new Set(['open', 'high', 'low', 'close', 'volume']);

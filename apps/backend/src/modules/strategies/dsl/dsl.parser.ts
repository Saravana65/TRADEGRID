import { Token, TokenType } from './dsl.tokens';
import { DSLSyntaxError } from './dsl.lexer';
import {
  StrategyAST,
  ExpressionNode,
  IndicatorDeclarationNode,
  BinaryOpNode,
  UnaryOpNode,
  LiteralNode,
  SeriesRefNode,
  IdentifierRefNode,
  IndicatorCallNode,
  BinaryOperator,
} from './dsl.ast';

const MAX_AST_NODES = 500;

export class DSLParser {
  private tokens: Token[];
  private current: number = 0;
  private nodeCount: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): StrategyAST {
    const ast: StrategyAST = {
      name: '',
      description: undefined,
      instrument: undefined,
      timeframe: undefined,
      indicators: [],
      entryConditions: [],
      exitConditions: [],
      riskSettings: {},
    };

    this.skipNewlines();

    while (!this.isAtEnd()) {
      const token = this.peek();

      if (token.type === 'NEWLINE') {
        this.advance();
        continue;
      }

      switch (token.type) {
        case 'STRATEGY': {
          this.advance();
          const strToken = this.consume('STRING', 'Expected strategy name string literal');
          ast.name = strToken.value;
          this.matchNewlineOrEOF();
          break;
        }

        case 'DESCRIPTION': {
          this.advance();
          const descToken = this.consume('STRING', 'Expected strategy description string literal');
          ast.description = descToken.value;
          this.matchNewlineOrEOF();
          break;
        }

        case 'INSTRUMENT': {
          this.advance();
          const instToken = this.consume('STRING', 'Expected instrument symbol string literal');
          ast.instrument = instToken.value;
          this.matchNewlineOrEOF();
          break;
        }

        case 'TIMEFRAME': {
          this.advance();
          const tfToken = this.consume('STRING', 'Expected timeframe string literal');
          ast.timeframe = tfToken.value;
          this.matchNewlineOrEOF();
          break;
        }

        case 'INDICATOR': {
          this.advance();
          const decl = this.parseIndicatorDeclaration();
          ast.indicators.push(decl);
          this.matchNewlineOrEOF();
          break;
        }

        case 'ENTRY': {
          this.advance();
          this.consume('COLON', "Expected ':' after 'entry'");
          this.skipNewlines();
          ast.entryConditions = this.parseConditionBlock(['EXIT', 'RISK', 'INDICATOR', 'STRATEGY']);
          break;
        }

        case 'EXIT': {
          this.advance();
          this.consume('COLON', "Expected ':' after 'exit'");
          this.skipNewlines();
          ast.exitConditions = this.parseConditionBlock(['ENTRY', 'RISK', 'INDICATOR', 'STRATEGY']);
          break;
        }

        case 'RISK': {
          this.advance();
          this.consume('COLON', "Expected ':' after 'risk'");
          this.skipNewlines();
          ast.riskSettings = this.parseRiskBlock(['ENTRY', 'EXIT', 'INDICATOR', 'STRATEGY']);
          break;
        }

        default:
          throw new DSLSyntaxError(
            `Unexpected top-level token '${token.value || token.type}'`,
            token.line,
            token.column
          );
      }

      this.skipNewlines();
    }

    if (!ast.name) {
      throw new DSLSyntaxError(
        "Missing required 'strategy' declaration",
        1,
        1,
        'MISSING_STRATEGY_NAME'
      );
    }

    return ast;
  }

  // ==========================================================================
  // Section Parsers
  // ==========================================================================

  private parseIndicatorDeclaration(): IndicatorDeclarationNode {
    this.trackNode();
    const idToken = this.consume('IDENTIFIER', 'Expected indicator variable identifier');
    this.consume('ASSIGN', "Expected '=' after indicator name");

    const funcToken = this.peek();
    if (funcToken.type !== 'IDENTIFIER') {
      throw new DSLSyntaxError(
        `Expected indicator function name, got '${funcToken.value}'`,
        funcToken.line,
        funcToken.column
      );
    }
    this.advance();

    this.consume('LPAREN', "Expected '(' after indicator function name");
    const args: ExpressionNode[] = [];

    if (!this.check('RPAREN')) {
      do {
        args.push(this.parseExpression());
      } while (this.match('COMMA'));
    }

    this.consume('RPAREN', "Expected ')' after indicator arguments");

    return {
      name: idToken.value,
      indicatorName: funcToken.value,
      args,
      line: idToken.line,
      column: idToken.column,
    };
  }

  private parseConditionBlock(stopKeywords: TokenType[]): ExpressionNode[] {
    const conditions: ExpressionNode[] = [];
    const stopSet = new Set(stopKeywords);

    while (!this.isAtEnd() && !stopSet.has(this.peek().type)) {
      if (this.check('NEWLINE')) {
        this.advance();
        continue;
      }

      const expr = this.parseExpression();
      conditions.push(expr);

      this.matchNewlineOrEOF();
      this.skipNewlines();
    }

    return conditions;
  }

  private parseRiskBlock(stopKeywords: TokenType[]): Record<string, number> {
    const risk: Record<string, number> = {};
    const stopSet = new Set(stopKeywords);

    while (!this.isAtEnd() && !stopSet.has(this.peek().type)) {
      if (this.check('NEWLINE')) {
        this.advance();
        continue;
      }

      const keyToken = this.consume('IDENTIFIER', 'Expected risk configuration parameter name');
      this.consume('ASSIGN', "Expected '=' after risk parameter name");

      let isNegative = false;
      if (this.match('MINUS')) {
        isNegative = true;
      }

      const valToken = this.peek();
      let numVal: number;

      if (valToken.type === 'PERCENT') {
        this.advance();
        numVal = (parseFloat(valToken.value) / 100) * (isNegative ? -1 : 1);
      } else if (valToken.type === 'NUMBER') {
        this.advance();
        numVal = parseFloat(valToken.value) * (isNegative ? -1 : 1);
      } else {
        throw new DSLSyntaxError(
          `Expected numeric or percentage value for risk parameter '${keyToken.value}', got '${valToken.value}'`,
          valToken.line,
          valToken.column
        );
      }

      risk[keyToken.value] = numVal;
      this.matchNewlineOrEOF();
      this.skipNewlines();
    }

    return risk;
  }

  // ==========================================================================
  // Expression Parser (Precedence Hierarchy)
  // ==========================================================================

  public parseExpression(): ExpressionNode {
    return this.parseOr();
  }

  private parseOr(): ExpressionNode {
    let expr = this.parseAnd();

    while (this.match('OR')) {
      const opToken = this.previous();
      this.trackNode();
      const right = this.parseAnd();
      expr = {
        type: 'BinaryOp',
        op: 'or',
        left: expr,
        right,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return expr;
  }

  private parseAnd(): ExpressionNode {
    let expr = this.parseEquality();

    while (this.match('AND')) {
      const opToken = this.previous();
      this.trackNode();
      const right = this.parseEquality();
      expr = {
        type: 'BinaryOp',
        op: 'and',
        left: expr,
        right,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return expr;
  }

  private parseEquality(): ExpressionNode {
    let expr = this.parseComparison();

    while (this.match('EQ', 'NEQ')) {
      const opToken = this.previous();
      this.trackNode();
      const op = opToken.type === 'EQ' ? '==' : '!=';
      const right = this.parseComparison();
      expr = {
        type: 'BinaryOp',
        op,
        left: expr,
        right,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return expr;
  }

  private parseComparison(): ExpressionNode {
    let expr = this.parseAdditive();

    while (this.match('GT', 'LT', 'GTE', 'LTE', 'CROSSES_ABOVE', 'CROSSES_BELOW')) {
      const opToken = this.previous();
      this.trackNode();
      let op: BinaryOperator;
      switch (opToken.type) {
        case 'GT':
          op = '>';
          break;
        case 'LT':
          op = '<';
          break;
        case 'GTE':
          op = '>=';
          break;
        case 'LTE':
          op = '<=';
          break;
        case 'CROSSES_ABOVE':
          op = 'crosses_above';
          break;
        case 'CROSSES_BELOW':
          op = 'crosses_below';
          break;
        default:
          op = '>';
      }

      const right = this.parseAdditive();
      expr = {
        type: 'BinaryOp',
        op,
        left: expr,
        right,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return expr;
  }

  private parseAdditive(): ExpressionNode {
    let expr = this.parseMultiplicative();

    while (this.match('PLUS', 'MINUS')) {
      const opToken = this.previous();
      this.trackNode();
      const op: BinaryOperator = opToken.type === 'PLUS' ? '+' : '-';
      const right = this.parseMultiplicative();
      expr = {
        type: 'BinaryOp',
        op,
        left: expr,
        right,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return expr;
  }

  private parseMultiplicative(): ExpressionNode {
    let expr = this.parseUnary();

    while (this.match('MULTIPLY', 'DIVIDE')) {
      const opToken = this.previous();
      this.trackNode();
      const op: BinaryOperator = opToken.type === 'MULTIPLY' ? '*' : '/';
      const right = this.parseUnary();
      expr = {
        type: 'BinaryOp',
        op,
        left: expr,
        right,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return expr;
  }

  private parseUnary(): ExpressionNode {
    if (this.match('NOT', 'MINUS')) {
      const opToken = this.previous();
      this.trackNode();
      const op = opToken.type === 'NOT' ? 'not' : '-';
      const operand = this.parseUnary();
      return {
        type: 'UnaryOp',
        op,
        operand,
        line: opToken.line,
        column: opToken.column,
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    this.trackNode();
    const token = this.peek();

    // 1. Number Literal
    if (this.match('NUMBER')) {
      return {
        type: 'Literal',
        value: parseFloat(token.value),
        rawType: 'number',
        line: token.line,
        column: token.column,
      };
    }

    // 2. Percent Literal
    if (this.match('PERCENT')) {
      return {
        type: 'Literal',
        value: parseFloat(token.value) / 100,
        rawType: 'percent',
        line: token.line,
        column: token.column,
      };
    }

    // 3. String Literal
    if (this.match('STRING')) {
      return {
        type: 'Literal',
        value: token.value,
        rawType: 'string',
        line: token.line,
        column: token.column,
      };
    }

    // 4. Boolean Literals
    if (this.match('TRUE')) {
      return {
        type: 'Literal',
        value: true,
        rawType: 'boolean',
        line: token.line,
        column: token.column,
      };
    }
    if (this.match('FALSE')) {
      return {
        type: 'Literal',
        value: false,
        rawType: 'boolean',
        line: token.line,
        column: token.column,
      };
    }

    // 5. Built-in Series Keyword (open, high, low, close, volume)
    if (this.match('SERIES')) {
      return {
        type: 'SeriesRef',
        series: token.value as any,
        line: token.line,
        column: token.column,
      };
    }

    // 6. Identifier (variable or function call)
    if (this.match('IDENTIFIER')) {
      // Check if it's an inline function call e.g. SMA(close, 20)
      if (this.match('LPAREN')) {
        const args: ExpressionNode[] = [];
        if (!this.check('RPAREN')) {
          do {
            args.push(this.parseExpression());
          } while (this.match('COMMA'));
        }
        this.consume('RPAREN', "Expected ')' after function call arguments");
        return {
          type: 'IndicatorCall',
          name: token.value,
          args,
          line: token.line,
          column: token.column,
        };
      }

      return {
        type: 'IdentifierRef',
        name: token.value,
        line: token.line,
        column: token.column,
      };
    }

    // 7. Grouping: ( expr )
    if (this.match('LPAREN')) {
      const expr = this.parseExpression();
      this.consume('RPAREN', "Expected ')' after grouping expression");
      return expr;
    }

    throw new DSLSyntaxError(
      `Unexpected expression token '${token.value || token.type}'`,
      token.line,
      token.column
    );
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private trackNode(): void {
    this.nodeCount++;
    if (this.nodeCount > MAX_AST_NODES) {
      const t = this.peek();
      throw new DSLSyntaxError(
        `Strategy AST complexity exceeds safety limit (max ${MAX_AST_NODES} nodes)`,
        t.line,
        t.column,
        'COMPLEXITY_LIMIT'
      );
    }
  }

  private match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return type === 'EOF';
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === 'EOF';
  }

  private peek(): Token {
    return this.tokens[this.current];
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private consume(type: TokenType, errorMessage: string): Token {
    if (this.check(type)) return this.advance();
    const token = this.peek();
    throw new DSLSyntaxError(errorMessage, token.line, token.column);
  }

  private skipNewlines(): void {
    while (this.check('NEWLINE')) {
      this.advance();
    }
  }

  private matchNewlineOrEOF(): void {
    if (this.check('NEWLINE')) {
      this.advance();
    } else if (!this.check('EOF')) {
      const t = this.peek();
      throw new DSLSyntaxError(`Expected newline after statement, got '${t.value}'`, t.line, t.column);
    }
  }
}

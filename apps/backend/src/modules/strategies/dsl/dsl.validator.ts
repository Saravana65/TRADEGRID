import { DSLLexer, DSLSyntaxError } from './dsl.lexer';
import { DSLParser } from './dsl.parser';
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
} from './dsl.ast';
import { DSLValidationResult, DSLValidationError } from '@tradegrid/shared-types';

const FORBIDDEN_IDENTIFIERS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'eval',
  'process',
  'window',
  'global',
  'globalthis',
  'require',
  'import',
  'function',
  'module',
  'exports',
]);

interface IndicatorSignature {
  minArgs: number;
  maxArgs: number;
  validateArgs: (args: ExpressionNode[], node: IndicatorDeclarationNode | IndicatorCallNode) => string | null;
}

const SUPPORTED_INDICATORS: Record<string, IndicatorSignature> = {
  SMA: {
    minArgs: 1,
    maxArgs: 2,
    validateArgs: (args) => {
      if (args.length === 2) {
        const periodNode = args[1];
        if (periodNode.type !== 'Literal' || typeof periodNode.value !== 'number' || periodNode.value < 1) {
          return "SMA period argument must be a positive integer >= 1 (e.g. SMA(close, 20))";
        }
      }
      return null;
    },
  },
  EMA: {
    minArgs: 1,
    maxArgs: 2,
    validateArgs: (args) => {
      if (args.length === 2) {
        const periodNode = args[1];
        if (periodNode.type !== 'Literal' || typeof periodNode.value !== 'number' || periodNode.value < 1) {
          return "EMA period argument must be a positive integer >= 1 (e.g. EMA(close, 12))";
        }
      }
      return null;
    },
  },
  RSI: {
    minArgs: 1,
    maxArgs: 2,
    validateArgs: (args) => {
      if (args.length === 2) {
        const periodNode = args[1];
        if (periodNode.type !== 'Literal' || typeof periodNode.value !== 'number' || periodNode.value < 2) {
          return "RSI period argument must be an integer >= 2 (e.g. RSI(close, 14))";
        }
      }
      return null;
    },
  },
  MACD: {
    minArgs: 1,
    maxArgs: 4,
    validateArgs: (args) => {
      if (args.length > 1) {
        for (let i = 1; i < args.length; i++) {
          const arg = args[i];
          if (arg.type !== 'Literal' || typeof arg.value !== 'number' || arg.value < 1) {
            return "MACD fast, slow, and signal periods must be positive integers (e.g. MACD(close, 12, 26, 9))";
          }
        }
      }
      return null;
    },
  },
  BOLLINGERBANDS: {
    minArgs: 1,
    maxArgs: 3,
    validateArgs: (args) => {
      if (args.length >= 2) {
        const period = args[1];
        if (period.type !== 'Literal' || typeof period.value !== 'number' || period.value < 2) {
          return "BollingerBands period must be an integer >= 2";
        }
      }
      if (args.length === 3) {
        const stdDev = args[2];
        if (stdDev.type !== 'Literal' || typeof stdDev.value !== 'number' || stdDev.value <= 0) {
          return "BollingerBands stdDev must be a positive number > 0 (e.g. 2.0)";
        }
      }
      return null;
    },
  },
  VWAP: {
    minArgs: 0,
    maxArgs: 1,
    validateArgs: () => null,
  },
};

export class DSLValidator {
  /**
   * Validates a raw DSL source string and returns validation errors and parsed AST.
   */
  static validate(dslSource: string): DSLValidationResult {
    const errors: DSLValidationError[] = [];

    if (!dslSource || dslSource.trim().length === 0) {
      return {
        isValid: false,
        errors: [{ line: 1, column: 1, message: 'Strategy DSL source code cannot be empty', code: 'EMPTY_SOURCE' }],
      };
    }

    let ast: StrategyAST;

    try {
      const lexer = new DSLLexer(dslSource);
      const tokens = lexer.tokenize();
      const parser = new DSLParser(tokens);
      ast = parser.parse();
    } catch (err: any) {
      if (err instanceof DSLSyntaxError) {
        return {
          isValid: false,
          errors: [{ line: err.line, column: err.column, message: err.message, code: err.code }],
        };
      }
      return {
        isValid: false,
        errors: [{ line: 1, column: 1, message: err.message || 'Unknown syntax error', code: 'PARSE_FAILED' }],
      };
    }

    // 1. Validate Strategy Name
    if (!ast.name || ast.name.trim().length === 0) {
      errors.push({
        line: 1,
        column: 1,
        message: 'Strategy must have a valid non-empty name',
        code: 'MISSING_STRATEGY_NAME',
      });
    }

    // 2. Validate Indicator Declarations
    const declaredIndicators = new Set<string>();

    for (const ind of ast.indicators) {
      const lowerName = ind.name.toLowerCase();

      if (FORBIDDEN_IDENTIFIERS.has(lowerName)) {
        errors.push({
          line: ind.line,
          column: ind.column,
          message: `Forbidden indicator name '${ind.name}'`,
          code: 'FORBIDDEN_IDENTIFIER',
        });
      }

      if (declaredIndicators.has(ind.name)) {
        errors.push({
          line: ind.line,
          column: ind.column,
          message: `Duplicate indicator variable '${ind.name}' already declared`,
          code: 'DUPLICATE_INDICATOR',
        });
      }
      declaredIndicators.add(ind.name);

      const upperInd = ind.indicatorName.toUpperCase();
      const sig = SUPPORTED_INDICATORS[upperInd];

      if (!sig) {
        errors.push({
          line: ind.line,
          column: ind.column,
          message: `Unsupported indicator function '${ind.indicatorName}'. Allowed: SMA, EMA, RSI, MACD, BollingerBands, VWAP`,
          code: 'UNSUPPORTED_FUNCTION',
        });
      } else {
        if (ind.args.length < sig.minArgs || ind.args.length > sig.maxArgs) {
          errors.push({
            line: ind.line,
            column: ind.column,
            message: `Indicator '${ind.indicatorName}' expects between ${sig.minArgs} and ${sig.maxArgs} arguments, got ${ind.args.length}`,
            code: 'INVALID_ARGUMENT_COUNT',
          });
        } else {
          const argErr = sig.validateArgs(ind.args, ind);
          if (argErr) {
            errors.push({
              line: ind.line,
              column: ind.column,
              message: argErr,
              code: 'INVALID_INDICATOR_ARGS',
            });
          }
        }
      }
    }

    // 3. Validate Entry and Exit Condition Expressions
    if (ast.entryConditions.length === 0) {
      errors.push({
        line: 1,
        column: 1,
        message: "Strategy must declare at least one condition in the 'entry:' block",
        code: 'MISSING_ENTRY_CONDITION',
      });
    }

    for (const expr of ast.entryConditions) {
      this.validateExpression(expr, declaredIndicators, errors, 'entry');
    }

    for (const expr of ast.exitConditions) {
      this.validateExpression(expr, declaredIndicators, errors, 'exit');
    }

    // 4. Validate Risk Settings
    for (const [key, val] of Object.entries(ast.riskSettings)) {
      if (val < 0) {
        errors.push({
          line: 1,
          column: 1,
          message: `Risk parameter '${key}' cannot be negative`,
          code: 'INVALID_RISK_VALUE',
        });
      }
      if (key === 'stop_loss' && val > 1.0) {
        errors.push({
          line: 1,
          column: 1,
          message: `Risk parameter 'stop_loss' cannot exceed 100% (1.0)`,
          code: 'INVALID_RISK_VALUE',
        });
      }
      if (key === 'max_position_size' && (val <= 0 || val > 1.0)) {
        errors.push({
          line: 1,
          column: 1,
          message: `Risk parameter 'max_position_size' must be between 0% and 100%`,
          code: 'INVALID_RISK_VALUE',
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      ast: errors.length === 0 ? ast : undefined,
      declaredIndicators: Array.from(declaredIndicators),
      inferredInstrument: ast.instrument,
      inferredTimeframe: ast.timeframe,
    };
  }

  private static validateExpression(
    expr: ExpressionNode,
    declaredIndicators: Set<string>,
    errors: DSLValidationError[],
    context: 'entry' | 'exit'
  ): 'boolean' | 'number' | 'unknown' {
    switch (expr.type) {
      case 'BinaryOp': {
        const leftType = this.validateExpression(expr.left, declaredIndicators, errors, context);
        const rightType = this.validateExpression(expr.right, declaredIndicators, errors, context);

        if (expr.op === 'and' || expr.op === 'or') {
          if (leftType !== 'boolean' || rightType !== 'boolean') {
            errors.push({
              line: expr.line,
              column: expr.column,
              message: `Operator '${expr.op}' requires boolean operands on both sides`,
              code: 'TYPE_MISMATCH',
            });
          }
          return 'boolean';
        }

        if (
          expr.op === '>' ||
          expr.op === '<' ||
          expr.op === '>=' ||
          expr.op === '<=' ||
          expr.op === '==' ||
          expr.op === '!=' ||
          expr.op === 'crosses_above' ||
          expr.op === 'crosses_below'
        ) {
          return 'boolean';
        }

        if (expr.op === '+' || expr.op === '-' || expr.op === '*' || expr.op === '/') {
          if (leftType === 'boolean' || rightType === 'boolean') {
            errors.push({
              line: expr.line,
              column: expr.column,
              message: `Arithmetic operator '${expr.op}' cannot be applied to boolean values`,
              code: 'TYPE_MISMATCH',
            });
          }
          return 'number';
        }

        return 'unknown';
      }

      case 'UnaryOp': {
        const operandType = this.validateExpression(expr.operand, declaredIndicators, errors, context);
        if (expr.op === 'not') {
          if (operandType !== 'boolean') {
            errors.push({
              line: expr.line,
              column: expr.column,
              message: "Operator 'not' requires a boolean condition",
              code: 'TYPE_MISMATCH',
            });
          }
          return 'boolean';
        }
        if (expr.op === '-') {
          return 'number';
        }
        return 'unknown';
      }

      case 'Literal': {
        if (expr.rawType === 'boolean') return 'boolean';
        return 'number';
      }

      case 'SeriesRef': {
        return 'number';
      }

      case 'IdentifierRef': {
        if (FORBIDDEN_IDENTIFIERS.has(expr.name.toLowerCase())) {
          errors.push({
            line: expr.line,
            column: expr.column,
            message: `Forbidden identifier '${expr.name}'`,
            code: 'FORBIDDEN_IDENTIFIER',
          });
          return 'unknown';
        }

        if (!declaredIndicators.has(expr.name)) {
          errors.push({
            line: expr.line,
            column: expr.column,
            message: `Undeclared variable or indicator '${expr.name}'. Declare it first via 'indicator ${expr.name} = ...'`,
            code: 'UNDECLARED_VARIABLE',
          });
          return 'unknown';
        }

        return 'number';
      }

      case 'IndicatorCall': {
        const upper = expr.name.toUpperCase();
        if (!SUPPORTED_INDICATORS[upper]) {
          errors.push({
            line: expr.line,
            column: expr.column,
            message: `Unknown indicator function '${expr.name}' in condition`,
            code: 'UNSUPPORTED_FUNCTION',
          });
        }
        return 'number';
      }

      default:
        return 'unknown';
    }
  }
}

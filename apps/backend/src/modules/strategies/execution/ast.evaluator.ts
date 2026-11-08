import { ExpressionNode, BinaryOpNode, UnaryOpNode } from '../dsl/dsl.ast';

export interface EvaluationContext {
  barIndex: number;
  series: {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  };
  indicators: Record<string, (number | null)[]>;
}

export class ASTEvaluator {
  /**
   * Safely evaluates an AST expression node in an isolated context without eval().
   */
  public static evaluate(node: ExpressionNode, ctx: EvaluationContext): number | boolean | string {
    switch (node.type) {
      case 'Literal': {
        if (node.rawType === 'percent') {
          return typeof node.value === 'number' ? node.value / 100 : parseFloat(String(node.value)) / 100;
        }
        return node.value;
      }

      case 'SeriesRef': {
        const seriesData = ctx.series[node.series];
        if (!seriesData || ctx.barIndex < 0 || ctx.barIndex >= seriesData.length) {
          return 0;
        }
        return seriesData[ctx.barIndex] ?? 0;
      }

      case 'IdentifierRef': {
        const indData =
          ctx.indicators[node.name] ??
          ctx.indicators[node.name.toLowerCase()] ??
          ctx.indicators[node.name.toUpperCase()];

        if (!indData || ctx.barIndex < 0 || ctx.barIndex >= indData.length) {
          return 0;
        }
        const val = indData[ctx.barIndex];
        return val !== null && val !== undefined ? val : 0;
      }

      case 'UnaryOp': {
        return this.evaluateUnary(node, ctx);
      }

      case 'BinaryOp': {
        return this.evaluateBinary(node, ctx);
      }

      case 'IndicatorCall': {
        // If an inline indicator call was made, check if its result was pre-calculated
        const key = `${node.name}_${node.args.map((a) => (a as any).value ?? '').join('_')}`;
        const indData = ctx.indicators[key] ?? ctx.indicators[node.name];
        if (indData && ctx.barIndex >= 0 && ctx.barIndex < indData.length) {
          const val = indData[ctx.barIndex];
          return val !== null && val !== undefined ? val : 0;
        }
        return 0;
      }

      default:
        throw new Error(`Unsupported AST node type: ${(node as any).type}`);
    }
  }

  private static evaluateUnary(node: UnaryOpNode, ctx: EvaluationContext): boolean | number {
    const operand = this.evaluate(node.operand, ctx);
    switch (node.op) {
      case 'not':
        return !Boolean(operand);
      case '-':
        return -Number(operand);
      default:
        throw new Error(`Unsupported unary operator: ${node.op}`);
    }
  }

  private static evaluateBinary(node: BinaryOpNode, ctx: EvaluationContext): boolean | number {
    // 1. Crosses detection requires comparing t-1 with t
    if (node.op === 'crosses_above') {
      if (ctx.barIndex <= 0) return false;

      const prevCtx: EvaluationContext = { ...ctx, barIndex: ctx.barIndex - 1 };
      const leftPrev = Number(this.evaluate(node.left, prevCtx));
      const rightPrev = Number(this.evaluate(node.right, prevCtx));

      const leftCurr = Number(this.evaluate(node.left, ctx));
      const rightCurr = Number(this.evaluate(node.right, ctx));

      return leftPrev <= rightPrev && leftCurr > rightCurr;
    }

    if (node.op === 'crosses_below') {
      if (ctx.barIndex <= 0) return false;

      const prevCtx: EvaluationContext = { ...ctx, barIndex: ctx.barIndex - 1 };
      const leftPrev = Number(this.evaluate(node.left, prevCtx));
      const rightPrev = Number(this.evaluate(node.right, prevCtx));

      const leftCurr = Number(this.evaluate(node.left, ctx));
      const rightCurr = Number(this.evaluate(node.right, ctx));

      return leftPrev >= rightPrev && leftCurr < rightCurr;
    }

    // 2. Logical operators with short-circuiting
    if (node.op === 'and') {
      const left = Boolean(this.evaluate(node.left, ctx));
      if (!left) return false;
      return Boolean(this.evaluate(node.right, ctx));
    }

    if (node.op === 'or') {
      const left = Boolean(this.evaluate(node.left, ctx));
      if (left) return true;
      return Boolean(this.evaluate(node.right, ctx));
    }

    // 3. Evaluate operands for comparison and arithmetic
    const leftVal = this.evaluate(node.left, ctx);
    const rightVal = this.evaluate(node.right, ctx);

    switch (node.op) {
      case '>':
        return Number(leftVal) > Number(rightVal);
      case '<':
        return Number(leftVal) < Number(rightVal);
      case '>=':
        return Number(leftVal) >= Number(rightVal);
      case '<=':
        return Number(leftVal) <= Number(rightVal);
      case '==':
        return leftVal === rightVal;
      case '!=':
        return leftVal !== rightVal;

      case '+':
        return Number(leftVal) + Number(rightVal);
      case '-':
        return Number(leftVal) - Number(rightVal);
      case '*':
        return Number(leftVal) * Number(rightVal);
      case '/': {
        const denom = Number(rightVal);
        return denom === 0 ? 0 : Number(leftVal) / denom;
      }

      default:
        throw new Error(`Unsupported binary operator: ${node.op}`);
    }
  }
}

export type BinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '>'
  | '<'
  | '>='
  | '<='
  | '=='
  | '!='
  | 'and'
  | 'or'
  | 'crosses_above'
  | 'crosses_below';

export type UnaryOperator = 'not' | '-';

export interface BaseASTNode {
  line: number;
  column: number;
}

export interface BinaryOpNode extends BaseASTNode {
  type: 'BinaryOp';
  op: BinaryOperator;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryOpNode extends BaseASTNode {
  type: 'UnaryOp';
  op: UnaryOperator;
  operand: ExpressionNode;
}

export interface LiteralNode extends BaseASTNode {
  type: 'Literal';
  value: number | string | boolean;
  rawType: 'number' | 'string' | 'boolean' | 'percent';
}

export interface SeriesRefNode extends BaseASTNode {
  type: 'SeriesRef';
  series: 'open' | 'high' | 'low' | 'close' | 'volume';
}

export interface IdentifierRefNode extends BaseASTNode {
  type: 'IdentifierRef';
  name: string;
}

export interface IndicatorCallNode extends BaseASTNode {
  type: 'IndicatorCall';
  name: string;
  args: ExpressionNode[];
}

export type ExpressionNode =
  | BinaryOpNode
  | UnaryOpNode
  | LiteralNode
  | SeriesRefNode
  | IdentifierRefNode
  | IndicatorCallNode;

export interface IndicatorDeclarationNode extends BaseASTNode {
  name: string;
  indicatorName: string;
  args: ExpressionNode[];
}

export interface StrategyAST {
  name: string;
  description?: string;
  instrument?: string;
  timeframe?: string;
  indicators: IndicatorDeclarationNode[];
  entryConditions: ExpressionNode[];
  exitConditions: ExpressionNode[];
  riskSettings: Record<string, number>;
}

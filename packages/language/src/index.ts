// Language core exports

// Compiler exports (all compiler functionality is now part of language package)
export * from './compiler/index.js';
export * from './eligian-module.js';
export * from './eligian-validator.js';
// Re-export everything from AST except TimeExpression to avoid conflict
// Export AstTimeExpression explicitly to avoid conflict with compiler's TimeExpression
export type {
  ActionCallExpression,
  ArrayLiteral,
  BinaryExpression,
  BinaryTimeExpression,
  BooleanLiteral,
  EndableActionDefinition,
  Expression,
  InlineEndableAction,
  NamedActionInvocation,
  NullLiteral,
  NumberLiteral,
  ObjectLiteral,
  ObjectProperty,
  OperationCall,
  Program,
  PropertyChainReference,
  RegularActionDefinition,
  StringLiteral,
  TimeExpression as AstTimeExpression,
  TimeLiteral,
  Timeline,
  TimelineEvent,
  TimeRange,
  UnaryExpression,
} from './generated/ast.js';
export * from './generated/grammar.js';
export * from './generated/module.js';
export type {
  EligianType,
  TypeAnnotation,
  TypeConstraint,
} from './type-system/index.js';
// Type system exports (explicit to avoid conflicts with compiler types)
export {
  collectParameterConstraints,
  getOperationParameterTypes,
  inferLiteralType,
  inferParameterTypes,
  TypeEnvironment,
  unifyConstraints,
  validateTypeCompatibility,
} from './type-system/index.js';
// Note: SourceLocation and TypeError from type-system conflict with compiler exports
// Use compiler's versions for now (they're compatible)

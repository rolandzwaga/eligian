grammar Eligian

/**
 * Eligian DSL Grammar
 *
 * This grammar defines the syntax for the Eligius Story Telling Engine DSL.
 *
 * Design Principles:
 * - Function-style operation calls with positional parameters
 * - Dollar sign ($) for property chain references
 * - Square brackets for operation lists
 * - No hardcoded operations (grammar is operation-agnostic)
 * - Flatten wrapper objects (compiler handles nesting)
 * - Timeline accepts only endable actions
 *
 * See: DSL_DESIGN_DECISIONS.md for detailed design rationale
 */

// ============================================================================
// Program Structure
// ============================================================================

entry Program:
    (elements += ProgramElement)*;

ProgramElement:
    ActionDefinition | Timeline;

// ============================================================================
// Action Definitions
// ============================================================================

/**
 * Action Definition - Reusable action with operation list
 *
 * Regular action:
 *   action fadeIn [
 *     selectElement(".target")
 *     animate({ opacity: 1 }, 500)
 *   ]
 *
 * Endable action (with start and end operations):
 *   endable action showThenHide [
 *     selectElement(".box")
 *     addClass("visible")
 *   ] [
 *     removeClass("visible")
 *   ]
 */
ActionDefinition:
    EndableActionDefinition | RegularActionDefinition;

RegularActionDefinition:
    'action' name=ID
    '[' (operations += OperationStatement)* ']';

EndableActionDefinition:
    'endable' 'action' name=ID
    '[' (startOperations += OperationStatement)* ']'
    '[' (endOperations += OperationStatement)* ']';

/**
 * Operation Statement - Base type for all operation-like constructs
 *
 * This includes:
 * - Regular operation calls (selectElement, animate, etc.)
 * - Control flow statements (if/else, for loops)
 */
OperationStatement:
    IfStatement | ForStatement | OperationCall;

/**
 * If/Else Statement - Syntactic sugar for when/otherwise/endWhen
 *
 * Examples:
 *   if ($operationdata.count > 5) {
 *     addClass("highlight")
 *   }
 *
 *   if ($operationdata.enabled) {
 *     selectElement(".box")
 *     addClass("active")
 *   } else {
 *     removeClass("active")
 *   }
 */
IfStatement:
    'if' '(' condition=Expression ')' '{' (thenOps += OperationStatement)* '}'
    ('else' '{' (elseOps += OperationStatement)* '}')?;

/**
 * For Loop - Syntactic sugar for forEach/endForEach
 *
 * Examples:
 *   for (item in $operationdata.items) {
 *     selectElement(".template")
 *     setElementContent(item)
 *   }
 *
 *   for (slide in slides) {
 *     addClass("animated")
 *   }
 */
ForStatement:
    'for' '(' itemName=ID 'in' collection=Expression ')' '{' (body += OperationStatement)* '}';

/**
 * Operation Call - Function-style call with positional parameters
 *
 * Examples:
 *   selectElement(".target")
 *   animate({ opacity: 1 }, 500, "ease")
 *   setStyle({ color: "red", opacity: 0 })
 *   when($operationdata.count > 5)
 */
OperationCall:
    operationName=ID '(' (args += Expression (',' args += Expression)*)? ')';

// ============================================================================
// Timeline Definitions
// ============================================================================

/**
 * Timeline - Defines the time source and timeline events
 *
 * Syntax:
 *   timeline "main" using video from "video.mp4" {
 *     at 0s..5s { showThenHide() }
 *     at 2s..4s [ ... ] [ ... ]
 *   }
 */
Timeline:
    'timeline' name=STRING 'using' provider=TimelineProvider ('from' source=STRING)?
    '{' (events += TimelineEvent)* '}';

TimelineProvider returns string:
    'video' | 'audio' | 'raf' | 'custom';

/**
 * Timeline Event - Endable action triggered at specific time range
 *
 * Named action invocation:
 *   at 0s..5s { fadeIn() }
 *
 * Inline endable action:
 *   at 0s..5s [
 *     selectElement(".box")
 *     addClass("visible")
 *   ] [
 *     removeClass("visible")
 *   ]
 */
TimelineEvent:
    'at' timeRange=TimeRange (action=TimelineAction);

TimelineAction:
    InlineEndableAction | NamedActionInvocation;

/**
 * Named action invocation - calls a defined endable action
 */
NamedActionInvocation:
    '{' actionCall=ActionCallExpression '}';

ActionCallExpression:
    action=[EndableActionDefinition:ID] '(' (args += Expression (',' args += Expression)*)? ')';

/**
 * Inline endable action - anonymous endable action defined at use site
 */
InlineEndableAction:
    '[' (startOperations += OperationStatement)* ']'
    '[' (endOperations += OperationStatement)* ']';

// ============================================================================
// Time Expressions
// ============================================================================

TimeRange:
    start=TimeExpression '..' end=TimeExpression;

TimeExpression:
    AdditiveTime;

AdditiveTime infers TimeExpression:
    MultiplicativeTime ({infer BinaryTimeExpression.left=current} op=('+' | '-') right=MultiplicativeTime)*;

MultiplicativeTime infers TimeExpression:
    PrimaryTime ({infer BinaryTimeExpression.left=current} op=('*' | '/') right=PrimaryTime)*;

PrimaryTime infers TimeExpression:
    '(' TimeExpression ')' |
    TimeLiteral |
    PropertyChainReference;

TimeLiteral:
    value=NUMBER unit=TimeUnit?;

TimeUnit returns string:
    'ms' | 's' | 'm' | 'h';

// ============================================================================
// Expressions (for operation arguments)
// ============================================================================

/**
 * Expression - Values that can be passed as operation arguments
 *
 * Supports:
 * - Literals: strings, numbers, booleans, null
 * - Object literals: { key: value, ... }
 * - Array literals: [value1, value2, ...]
 * - Property chain references: $context.currentItem, $operationdata.foo, $globaldata.bar
 * - Binary expressions: $operationdata.count > 5
 */
Expression:
    LogicalOr;

LogicalOr infers Expression:
    LogicalAnd ({infer BinaryExpression.left=current} op='||' right=LogicalAnd)*;

LogicalAnd infers Expression:
    Equality ({infer BinaryExpression.left=current} op='&&' right=Equality)*;

Equality infers Expression:
    Comparison ({infer BinaryExpression.left=current} op=('==' | '!=') right=Comparison)*;

Comparison infers Expression:
    Additive ({infer BinaryExpression.left=current} op=('>=' | '<=' | '>' | '<') right=Additive)*;

Additive infers Expression:
    Multiplicative ({infer BinaryExpression.left=current} op=('+' | '-') right=Multiplicative)*;

Multiplicative infers Expression:
    Unary ({infer BinaryExpression.left=current} op=('*' | '/' | '%' | '**') right=Unary)*;

Unary infers Expression:
    {infer UnaryExpression} op=('!' | '-') operand=Unary |
    Primary;

Primary infers Expression:
    '(' Expression ')' |
    Literal |
    PropertyChainReference |
    ObjectLiteral |
    ArrayLiteral;

// ============================================================================
// Property Chain References (with $ prefix)
// ============================================================================

/**
 * Property Chain Reference - Runtime data access with $ prefix
 *
 * Examples:
 *   $context.currentItem
 *   $context.currentItem.name
 *   $operationdata.selectedElement
 *   $globaldata.userSettings.theme
 */
PropertyChainReference:
    '$' scope=PropertyScope ('.' properties += ID)+;

PropertyScope returns string:
    'context' | 'operationdata' | 'globaldata';

// ============================================================================
// Literals
// ============================================================================

Literal:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral;

StringLiteral:
    value=STRING;

NumberLiteral:
    value=NUMBER;

BooleanLiteral:
    value?='true' | 'false';

NullLiteral:
    {infer NullLiteral} 'null';

/**
 * Object Literal - Key-value pairs
 *
 * Examples:
 *   { opacity: 1, color: "red" }
 *   { "operationdata.name": $context.currentItem }
 */
ObjectLiteral:
    '{' (properties += ObjectProperty (',' properties += ObjectProperty)*)? '}';

ObjectProperty:
    key=(ID | STRING) ':' value=Expression;

/**
 * Array Literal - List of expressions
 *
 * Examples:
 *   [1, 2, 3]
 *   ["foo", "bar"]
 *   [$context.item1, $context.item2]
 */
ArrayLiteral:
    '[' (elements += Expression (',' elements += Expression)*)? ']';

// ============================================================================
// Terminals - Lexical tokens
// ============================================================================

/**
 * IMPORTANT: Terminals are matched in order of definition.
 * More specific patterns must come before less specific ones.
 */

// NUMBER must come before other numeric patterns to match decimals
terminal NUMBER returns number:
    /[0-9]+(\.[0-9]+)?/;

terminal ID:
    /[_a-zA-Z][\w_]*/;

terminal STRING:
    /"(\\.|[^"\\])*"|'(\\.|[^'\\])*'/;

hidden terminal WS:
    /\s+/;

hidden terminal ML_COMMENT:
    /\/\*[\s\S]*?\*\//;

hidden terminal SL_COMMENT:
    /\/\/[^\n\r]*/;

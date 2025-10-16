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
    ActionDefinition | Timeline | VariableDeclaration;

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
 * Parameterized action:
 *   action fadeIn(selector, duration) [
 *     selectElement($operationdata.selector)
 *     animate({ opacity: 1 }, $operationdata.duration)
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
    'action' name=ID ('(' (parameters += Parameter (',' parameters += Parameter)*)? ')')?
    '[' (operations += OperationStatement)* ']';

EndableActionDefinition:
    'endable' 'action' name=ID ('(' (parameters += Parameter (',' parameters += Parameter)*)? ')')?
    '[' (startOperations += OperationStatement)* ']'
    '[' (endOperations += OperationStatement)* ']';

/**
 * Parameter - Action parameter declaration
 *
 * Examples:
 *   selector
 *   duration
 *
 * Parameters are accessed via $operationdata.paramName in the action body.
 */
Parameter:
    name=ID;

/**
 * Operation Statement - Base type for all operation-like constructs
 *
 * This includes:
 * - Regular operation calls (selectElement, animate, etc.)
 * - Control flow statements (if/else, for loops)
 * - Variable declarations (const varName = value)
 */
OperationStatement:
    IfStatement | ForStatement | VariableDeclaration | OperationCall;

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
 * Variable Declaration - Declare a constant variable
 *
 * Examples:
 *   const duration = 500
 *   const theme = "dark"
 *   const settings = { speed: 1, loop: true }
 *
 * Program-level: Sets global data (accessed via $globaldata.varName)
 * Action-level: Sets context variable (accessed via @varName)
 */
VariableDeclaration:
    'const' name=ID '=' value=Expression;

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
 * Timeline Event - Endable action triggered at specific time range OR sequence block OR stagger block
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
 *
 * Sequence block (T190):
 *   sequence {
 *     intro() for 5s
 *     main() for 10s
 *     outro() for 5s
 *   }
 *
 * Stagger block (T192):
 *   stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn for 2s
 */
TimelineEvent:
    StaggerBlock | SequenceBlock | TimedEvent;

TimedEvent:
    'at' timeRange=TimeRange (action=TimelineAction);

TimelineAction:
    InlineEndableAction | NamedActionInvocation;

/**
 * Sequence Block - Sequential events with automatic time calculation (T190)
 *
 * Example:
 *   sequence {
 *     intro() for 5s
 *     main() for 10s
 *   }
 *
 * Transforms to:
 *   at 0s..5s { intro() }
 *   at 5s..15s { main() }
 */
SequenceBlock:
    'sequence' '{' (items += SequenceItem)* '}';

SequenceItem:
    actionCall=ActionCallExpression 'for' duration=TimeExpression;

/**
 * Stagger Block - Staggered events with incremental start times (T192)
 *
 * Example:
 *   stagger 200ms [".item-1", ".item-2", ".item-3"] with fadeIn for 2s
 *
 * Transforms to:
 *   at 0s..2s { fadeIn(".item-1") }        // starts at 0s
 *   at 0.2s..2.2s { fadeIn(".item-2") }    // starts at 0.2s (0 + 200ms)
 *   at 0.4s..2.4s { fadeIn(".item-3") }    // starts at 0.4s (0 + 400ms)
 *
 * Supports both action calls and inline operation blocks:
 *   stagger 100ms items with fadeIn for 1s
 *   stagger 100ms items for 1s [
 *     addClass("active")
 *   ] [
 *     removeClass("active")
 *   ]
 */
StaggerBlock:
    'stagger' delay=TimeExpression items=Expression 'with' actionCall=ActionCallExpression 'for' duration=TimeExpression |
    'stagger' delay=TimeExpression items=Expression 'for' duration=TimeExpression '[' (startOps += OperationStatement)* ']' '[' (endOps += OperationStatement)* ']';

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
    RelativeTimeLiteral |
    TimeLiteral |
    PropertyChainReference;

/**
 * Relative Time Literal - Time offset from previous event (T189)
 *
 * Examples:
 *   +2s    = 2 seconds after previous event ends
 *   +500ms = 500 milliseconds after previous event ends
 *   +0s    = immediately after previous event ends
 */
RelativeTimeLiteral:
    '+' value=NUMBER unit=TimeUnit?;

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
    SystemPropertyReference |
    VariableReference |
    ParameterReference |
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

/**
 * System Property Reference - Access system context properties with @@ prefix
 *
 * Examples:
 *   @@currentItem  → $context.currentItem
 *   @@loopIndex    → $context.loopIndex
 *   @@loopLength   → $context.loopLength
 *   @@item         → $context.currentItem (aliased in for loops)
 *
 * Compiles to $context.propertyName string for Eligius runtime.
 */
SystemPropertyReference:
    '@@' name=ID;

/**
 * Variable Reference - Access action-scoped variables with @ prefix
 *
 * Examples:
 *   @duration
 *   @theme
 *   @index
 *
 * Compiles to $context.variables.varName string for Eligius runtime.
 */
VariableReference:
    '@' name=ID;

/**
 * Parameter Reference - Access action parameters with bare identifier
 *
 * Examples:
 *   selector
 *   duration
 *   items
 *
 * Only valid inside action bodies. Compiles to $operationdata.paramName.
 */
ParameterReference:
    name=ID;

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

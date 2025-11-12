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
// File Structure (Feature 023)
// ============================================================================

/**
 * EligianFile - Union entry point for both program and library files
 *
 * - Program: Regular .eligian files with timelines, actions, and imports
 * - Library: Library files with 'library' keyword, containing only actions
 *
 * Disambiguation: Presence of 'library' keyword determines file type.
 */
entry EligianFile:
    Program | Library;

/**
 * Library - Reusable action library file (Feature 023)
 *
 * Syntax: library <name>
 *
 * Example:
 *   library animations
 *
 *   action fadeIn(selector: string, duration: number) [
 *     selectElement(selector)
 *     animate({opacity: 1}, duration)
 *   ]
 *
 *   private action resetOpacity(selector: string) [
 *     selectElement(selector)
 *     setStyle('opacity', '0')
 *   ]
 *
 * Constraints (validated in eligian-validator.ts):
 * - Library files MUST only contain action definitions
 * - Library files MUST NOT contain timelines, constants, or imports
 * - Action names within library MUST be unique
 */
Library:
    'library' name=ID (actions += ActionDefinition)*;

// ============================================================================
// Program Structure
// ============================================================================

Program:
    (statements += ProgramStatement)*;

ProgramStatement:
    ImportStatement | ProgramElement;

ProgramElement:
    EventActionDefinition | ActionDefinition | Timeline | VariableDeclaration;

// ============================================================================
// Import Statements (Feature 009 + Feature 023)
// ============================================================================

/**
 * Import Statement - Asset imports and library action imports
 *
 * Union type for:
 * - DefaultImport: layout './file', styles './file', provider './file' (Feature 009)
 * - NamedImport: import name from './file' as type? (Feature 009)
 * - LibraryImport: import { action1, action2 } from './library.eligian' (Feature 023)
 */
ImportStatement:
    DefaultImport | NamedImport | LibraryImport;

/**
 * Default Import - Auto-assignment to configuration properties
 *
 * Syntax: <type> '<path>'
 *
 * Examples:
 *   layout './layout.html'      → assigns to layoutTemplate property
 *   styles './main.css'         → registers CSS for future completions
 *   provider './video.mp4'      → assigns to timelineProvider.source
 *
 * Type is inferred from file extension.
 * Path must be relative (validated in eligian-validator.ts).
 * Only ONE of each type allowed per document.
 */
DefaultImport:
    type=('layout' | 'styles' | 'provider') path=STRING;

/**
 * Named Import - Reusable asset reference with identifier
 *
 * Syntax: import <name> from '<path>' (as <type>)?
 *
 * Examples:
 *   import tooltip from './tooltip.html'
 *   import theme from './theme.css'
 *   import video from './intro.mp4'
 *   import data from './template.txt' as html  // explicit type override
 *
 * Name must be unique within document (validated in eligian-validator.ts).
 * Type is inferred from extension OR explicitly specified via 'as' clause.
 * Path must be relative (validated in eligian-validator.ts).
 */
NamedImport:
    'import' name=ID 'from' path=STRING ('as' assetType=AssetType)?;

/**
 * Asset Type - Supported asset types for explicit type override
 *
 * Values:
 *   html  - HTML files (layouts, content snippets)
 *   css   - CSS stylesheets (styling, class definitions)
 *   media - Video/audio files (timeline providers)
 */
AssetType returns string:
    'html' | 'css' | 'media';

/**
 * Library Import - Import actions from library files (Feature 023)
 *
 * Syntax: import { action1, action2 } from './library.eligian'
 * With aliasing: import { action1 as alias1 } from './library.eligian'
 *
 * Examples:
 *   import { fadeIn, fadeOut } from './animations.eligian'
 *   import { fadeIn as fade } from './animations.eligian'
 *   import { safeSelect, safeAddClass } from './utils.eligian'
 *
 * Constraints (validated in eligian-validator.ts):
 * - Path must be relative and point to a valid .eligian library file
 * - Imported actions must exist in the library and be public (not private)
 * - Imported action names must not conflict with locally-defined actions
 * - Aliased names must not conflict with existing actions or imports
 */
LibraryImport:
    'import' '{' actions += ActionImport (',' actions += ActionImport)* '}' 'from' path=STRING;

/**
 * Action Import - Single action import with optional aliasing (Feature 023)
 *
 * Syntax:
 *   action1          - import action1 with its original name
 *   action1 as alias - import action1 and rename it to alias
 *
 * The cross-reference [ActionDefinition:ID] enables:
 * - Validation that the action exists in the target library
 * - Hover documentation from the library action's JSDoc
 * - "Go to Definition" navigation to the library file
 * - Type checking for imported action parameters
 */
ActionImport:
    action=[ActionDefinition:ID] ('as' alias=ID)?;

// ============================================================================
// Action Definitions
// ============================================================================
// ============================================================================
// Event Actions (Feature 028)
// ============================================================================

/**
 * Event Action Definition - Actions triggered by eventbus events
 *
 * Syntax: on event "<eventName>" topic "<eventTopic>"? action <name>(<parameters>) [<operations>]
 *
 * Examples:
 *   Simple event action:
 *     on event "language-change" action UpdateLanguageDisplay(languageCode) [
 *       selectElement(".language-display")
 *       setTextContent(languageCode)
 *     ]
 *
 *   With topic namespace:
 *     on event "click" topic "navigation" action HandleNavClick(target) [
 *       selectElement(target)
 *       addClass("active")
 *     ]
 *
 *   Zero parameters:
 *     on event "timeline-complete" action ShowCompletionMessage [
 *       selectElement("#completion-overlay")
 *       removeClass("hidden")
 *     ]
 *
 * Parameters:
 * - Parameters map to $operationData.eventArgs[n] by index
 * - First parameter → eventArgs[0], second → eventArgs[1], etc.
 * - Event name and topic must be string literals (not variables)
 * - At least one operation required (no empty bodies)
 */
EventActionDefinition:
    'on' 'event' eventName=STRING?
    ('topic' eventTopic=STRING)?
    'action' name=ID
    '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')'
    '[' operations+=OperationStatement* ']';


/**
 * Action Definition - Reusable action with operation list (Feature 023: added visibility)
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
 * Private action (library-only, Feature 023):
 *   private action resetOpacity(selector: string) [
 *     selectElement(selector)
 *     setStyle('opacity', '0')
 *   ]
 *
 * Endable action (with start and end operations):
 *   endable action showThenHide [
 *     selectElement(".box")
 *     addClass("visible")
 *   ] [
 *     removeClass("visible")
 *   ]
 *
 * Visibility (Feature 023):
 * - private: Only usable within the same library file, cannot be imported
 * - public (default): Can be imported by other files
 * - Validation: 'private' keyword only allowed in library files (not programs)
 */
ActionDefinition:
    EndableActionDefinition | RegularActionDefinition;

RegularActionDefinition:
    (visibility='private')? 'action' name=ID ('(' (parameters += Parameter (',' parameters += Parameter)*)? ')')?
    '[' (operations += OperationStatement)* ']';

EndableActionDefinition:
    (visibility='private')? 'endable' 'action' name=ID ('(' (parameters += Parameter (',' parameters += Parameter)*)? ')')?
    '[' (startOperations += OperationStatement)* ']'
    '[' (endOperations += OperationStatement)* ']';

/**
 * Parameter - Action parameter declaration
 *
 * Examples:
 *   selector
 *   duration
 *   selector: string
 *   duration: number
 *
 * Parameters are accessed via $operationdata.paramName in the action body.
 * Type annotations are optional and used for compile-time type checking.
 */
Parameter:
    name=ID (':' type=TypeAnnotation)?;

/**
 * Type Annotation - Optional type hint for parameters
 *
 * Supported types:
 *   string  - String literals and selectors
 *   number  - Numeric values (durations, offsets, etc.)
 *   boolean - Boolean values
 *   object  - Object literals
 *   array   - Array literals
 */
TypeAnnotation returns string:
    'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Operation Statement - Base type for all operation-like constructs
 *
 * This includes:
 * - Regular operation calls (selectElement, animate, etc.)
 * - Control flow statements (if/else, for loops)
 * - Variable declarations (const varName = value)
 */
OperationStatement:
    IfStatement | ForStatement | VariableDeclaration | BreakStatement | ContinueStatement | OperationCall;

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
 * Break Statement - Exit current loop immediately
 *
 * Compiles to: breakForEach() operation
 *
 * Examples:
 *   for (item in items) {
 *     if (@@currentItem.invalid) {
 *       break  // Exit loop
 *     }
 *   }
 *
 * Validation: Must appear inside a ForStatement
 */
BreakStatement:
    {infer BreakStatement} 'break';

/**
 * Continue Statement - Skip to next loop iteration
 *
 * Compiles to: continueForEach() operation
 *
 * Examples:
 *   for (item in items) {
 *     if (@@currentItem.skip) {
 *       continue  // Skip this iteration
 *     }
 *   }
 *
 * Validation: Must appear inside a ForStatement
 */
ContinueStatement:
    {infer ContinueStatement} 'continue';

/**
 * Variable Declaration - Declare a constant variable
 *
 * Examples:
 *   const duration = 500
 *   const theme = "dark"
 *   const settings = { speed: 1, loop: true }
 *
 * Program-level: Sets global data (accessed via $globaldata.varName)
 * Action-level: Sets scope variable (accessed via @varName)
 */
VariableDeclaration:
    'const' name=ID '=' value=Expression;

/**
 * Operation Call - Unified syntax for both built-in operations and custom actions
 *
 * Feature 006 unified the syntax for operation and action calls.
 * Feature 007 adds cross-reference support for "Go to Definition":
 *
 * - operationName is a cross-reference that may resolve to an ActionDefinition
 * - If resolved (ref !== undefined) → custom action call, supports "Go to Definition"
 * - If unresolved (ref === undefined) → built-in operation, validate against registry
 * - Use $refText to always get the name string for both cases
 *
 * Examples:
 *   selectElement("#title")      // Built-in operation (ref undefined)
 *   fadeIn("#box", 1000)         // Custom action (ref = ActionDefinition if exists)
 *   animate({ opacity: 1 }, 500) // Built-in operation (ref undefined)
 */
OperationCall:
    operationName=[ActionDefinition:ID] '(' (args += Expression (',' args += Expression)*)? ')';

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
    'timeline' name=STRING 'in' containerSelector=STRING 'using' provider=TimelineProvider ('from' source=STRING)?
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
    InlineEndableAction | OperationCall | ForStatement | IfStatement;

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
    actionCall=OperationCall 'for' duration=TimeExpression;

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
    'stagger' delay=TimeExpression items=Expression 'with' actionCall=OperationCall 'for' duration=TimeExpression |
    'stagger' delay=TimeExpression items=Expression 'for' duration=TimeExpression '[' (startOps += OperationStatement)* ']' '[' (endOps += OperationStatement)* ']';


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
 * - Property chain references: $scope.currentItem, $operationdata.foo, $globaldata.bar
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
 *   $scope.currentItem
 *   $scope.currentItem.name
 *   $operationdata.selectedElement
 *   $globaldata.userSettings.theme
 */
PropertyChainReference:
    '$' scope=PropertyScope ('.' properties += ID)+;

PropertyScope returns string:
    'scope' | 'operationdata' | 'globaldata';

/**
 * System Property Reference - Access system scope properties with @@ prefix
 *
 * Examples:
 *   @@currentItem  → $scope.currentItem
 *   @@loopIndex    → $scope.loopIndex
 *   @@loopLength   → $scope.loopLength
 *   @@item         → $scope.currentItem (aliased in for loops)
 *
 * Compiles to $scope.propertyName string for Eligius runtime.
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
 * Cross-references to VariableDeclaration (const declarations).
 * Compiles to $scope.variables.varName string for Eligius runtime.
 */
VariableReference:
    '@' variable=[VariableDeclaration:ID];

/**
 * Parameter Reference - Access action parameters with bare identifier
 *
 * Examples:
 *   selector
 *   duration
 *   items
 *
 * Cross-references to Parameter from parent action.
 * Only valid inside action bodies. Compiles to $operationdata.paramName.
 */
ParameterReference:
    parameter=[Parameter:ID];

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
 *   { "operationdata.name": $scope.currentItem }
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
 *   [$scope.item1, $scope.item2]
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

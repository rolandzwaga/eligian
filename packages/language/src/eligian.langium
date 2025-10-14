grammar Eligian

/**
 * Eligius DSL Grammar
 *
 * This grammar defines the syntax for the Eligius Story Telling Engine DSL.
 * It supports:
 * - Timeline declarations
 * - Reusable action definitions (function-like)
 * - Timeline events with actions
 * - Action calls
 * - High-level action abstractions
 */

// Entry point: A program consists of action definitions, timelines, and events
entry Program:
    (elements += ProgramElement)*;

ProgramElement:
    ActionDefinition | Timeline | Event;

/**
 * Action Definition - Reusable action template (like a function)
 *
 * Syntax: action fadeIn(element, duration = 500ms) { ... }
 */
ActionDefinition:
    'action' name=ID '(' (parameters += Parameter (',' parameters += Parameter)*)? ')'
    '{' (operations += Operation)* '}';

Parameter:
    name=ID (':' type=ParameterType)? ('=' defaultValue=Literal)?;

ParameterType returns string:
    'selector' | 'number' | 'string' | 'boolean';

/**
 * Timeline - Defines the time source for the presentation
 *
 * Syntax: timeline video from "video.mp4"
 *         timeline audio from "audio.mp3"
 *         timeline raf
 */
Timeline:
    'timeline' provider=TimelineProvider ('from' source=STRING)?;

TimelineProvider returns string:
    'video' | 'audio' | 'raf' | 'custom';

/**
 * Event - Triggered at specific times on the timeline
 *
 * Syntax: event intro at 0..5 { show #title }
 */
Event:
    'event' name=ID 'at' timeRange=TimeRange
    '{' (actions += Action)* '}';

TimeRange:
    start=TimeExpression '..' end=TimeExpression;

TimeExpression:
    Addition;

Addition infers TimeExpression:
    Multiplication ({infer BinaryExpression.left=current} op=('+' | '-') right=Multiplication)*;

Multiplication infers TimeExpression:
    Primary ({infer BinaryExpression.left=current} op=('*' | '/') right=Primary)*;

Primary infers TimeExpression:
    '(' TimeExpression ')' |
    NumberLiteral |
    VariableReference;

NumberLiteral:
    value=NUMBER unit=TimeUnit?;

TimeUnit returns string:
    'ms' | 's' | 'm' | 'h';

VariableReference:
    name=ID;

/**
 * Actions - What happens when an event triggers
 *
 * Supports:
 * 1. Built-in actions: show, hide, animate, trigger
 * 2. Action calls: fadeIn(#title, 500ms)
 * 3. Raw operations (escape hatch)
 */
Action:
    BuiltInAction | ActionCall | RawOperation;

/**
 * Built-in high-level actions
 */
BuiltInAction:
    ShowAction | HideAction | AnimateAction | TriggerAction;

ShowAction:
    'show' target=Selector ('with' animation=ID '(' args=ArgumentList? ')')?;

HideAction:
    'hide' target=Selector ('with' animation=ID '(' args=ArgumentList? ')')?;

AnimateAction:
    'animate' target=Selector 'with' animation=ID '(' args=ArgumentList? ')';

TriggerAction:
    'trigger' actionName=ID ('on' target=Selector)?;

/**
 * Action Call - Call a user-defined action
 *
 * Syntax: fadeIn(#title, 500ms)
 */
ActionCall:
    action=[ActionDefinition:ID] '(' args=ArgumentList? ')';

ArgumentList:
    args += Argument (',' args += Argument)*;

Argument:
    IdSelector | ClassSelector | StringLiteral | BooleanLiteral | NullLiteral | TimeExpression;

/**
 * Selectors - CSS-like element selectors
 */
Selector:
    IdSelector | ClassSelector | ElementSelector;

IdSelector:
    '#' value=ID;

ClassSelector:
    '.' value=ID;

ElementSelector:
    value=ID;

/**
 * Raw Operation - Escape hatch for direct Eligius operations
 *
 * Syntax: operation { systemName: "selectElement", operationData: {...} }
 */
RawOperation:
    'operation' '{' properties += Property (',' properties += Property)* '}';

Property:
    key=ID ':' value=Literal;

/**
 * Operations - Building blocks for action definitions
 *
 * These are used inside action definitions to compose behavior.
 */
Operation:
    OnBlock | OperationCall;

OnBlock:
    'on' target=Selector '{' (operations += OperationCall)* '}';

OperationCall:
    name=ID '(' args=ArgumentList? ')';

/**
 * Literals - Constant values
 */
Literal:
    StringLiteral | NumberLiteral | BooleanLiteral | NullLiteral;

StringLiteral:
    value=STRING;

BooleanLiteral:
    value?='true' | 'false';

NullLiteral:
    {infer NullLiteral} 'null';

/**
 * Terminals - Lexical tokens
 */
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

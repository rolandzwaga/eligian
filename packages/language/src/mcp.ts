/**
 * The `@eligian/language/mcp` entry: what the Eligian MCP server reads from the
 * language package beyond its root (spec 058, phase 1, plan A7).
 */

export {
  type ActionBody,
  type ControllerBalance,
  controllerBalance,
  resolveOperationData,
  type WalkEvent,
  type WalkedOperation,
  type WalkResult,
  walkOperations,
} from './compiler/controller-balance.js';
export { hostControllers, hostFunctions } from './compiler/operations/host-operations.js';
export { getOrCreateServices } from './compiler/pipeline/services.js';
export {
  ASSET_REVIEW_CODES,
  TIMELINE_REVIEW_CODES,
  type TimelineFinding,
  type TimelineReviewCode,
  timelineFindings,
  timelineNames,
} from './compiler/timeline-review.js';
export {
  interactionActionName,
  type PlaybackVerb,
} from './compiler/transformers/navigate-operations.js';
export { SELF_RESOLVED } from './compiler/transformers/runtime-values.js';
export {
  COMMON_HTML_ATTRIBUTES,
  getElementAttributes,
  HTML_ELEMENT_NAMES,
} from './completion/html-elements.generated.js';
export {
  CONTROLLERS,
  type ControllerMetadata,
  getController,
} from './completion/metadata/controllers.generated.js';
export {
  TIMELINE_EVENTS,
  type TimelineEventMetadata,
} from './completion/metadata/timeline-events.generated.js';
export {
  argumentRole,
  calledAction,
  type ParameterRole,
  parameterRoles,
} from './css/parameter-roles.js';
export { layoutElementsOf, type SelectorNames, selectorNames } from './css/selector-sources.js';
export { HTMLRegistryService } from './html/html-registry.js';
export { type LayoutElements, readLayoutHtml, scanLayoutElements } from './html/layout-elements.js';
export type { HTMLAttributeMetadata } from './html/metadata-types.js';
export { EligianDocumentSymbolProvider } from './lsp/eligian-document-symbol-provider.js';
export {
  navigatesTo,
  similarTimelineNames,
  type TimelineSymbol,
  timelineNamed,
  timelineSymbolAt,
} from './lsp/timeline-symbols.js';
export { DOM_EVENTS } from './utils/dom-events.js';
export { eligiusTypeToDslAnnotation } from './utils/event-arg-types.js';
export { KEY_COMPLETIONS } from './utils/key-names.js';
export {
  type LifecycleInsertionPoint,
  lifecycleInsertionPoints,
} from './utils/timeline-lifecycle.js';

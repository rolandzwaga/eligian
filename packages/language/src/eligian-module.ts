import { inject, type Module } from 'langium';
import {
  createDefaultModule,
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
  type LangiumServices,
  type LangiumSharedServices,
  type PartialLangiumServices,
  type PartialLangiumSharedServices,
} from 'langium/lsp';
import {
  createTypirLangiumServices,
  initializeLangiumTypirServices,
  type TypirLangiumServices,
} from 'typir-langium';
import { CSSRegistryService } from './css/css-registry.js';
import { EligianCodeActionProvider } from './eligian-code-action-provider.js';
import { EligianCompletionProvider } from './eligian-completion-provider.js';
import { EligianDocumentBuilder } from './eligian-document-builder.js';
import { EligianDocumentValidator } from './eligian-document-validator.js';
import { EligianFormatter } from './eligian-formatter.js';
import { EligianHoverProvider } from './eligian-hover-provider.js';
import { EligianParserErrorMessageProvider } from './eligian-parser-error-provider.js';
import { EligianScopeComputation } from './eligian-scope-computation.js';
import { EligianScopeProvider } from './eligian-scope-provider.js';
import { EligianValidator, registerValidationChecks } from './eligian-validator.js';
import { EligianAstReflection } from './generated/ast.js';
import { EligianGeneratedModule, EligianGeneratedSharedModule } from './generated/module.js';
import { HTMLRegistryService } from './html/html-registry.js';
import { EligianCodeLensProvider } from './lsp/eligian-code-lens-provider.js';
import { EligianDocumentSymbolProvider } from './lsp/eligian-document-symbol-provider.js';
import { EligianInlayHintProvider } from './lsp/eligian-inlay-hint-provider.js';
import { EligianSignatureHelpProvider } from './lsp/eligian-signature-help-provider.js';
import {
  EligianDefinitionProvider,
  EligianReferencesProvider,
  EligianRenameProvider,
} from './lsp/eligian-timeline-providers.js';
import { type EligianSpecifics, EligianTypeSystem } from './type-system-typir/index.js';
import { LabelRegistryService } from './type-system-typir/utils/label-registry.js';
import { ValidationSettings } from './validators/validation-settings.js';

/**
 * Declaration of custom services - add your own service classes here.
 */
export type EligianAddedServices = {
  validation: {
    EligianValidator: EligianValidator;
    /** User-configurable validation options (`eligian.validation.*`) */
    Settings: ValidationSettings;
  };
  lsp: {
    HoverProvider: EligianHoverProvider;
    CompletionProvider: EligianCompletionProvider;
    CodeActionProvider: EligianCodeActionProvider;
    SignatureHelp: EligianSignatureHelpProvider;
    InlayHintProvider: EligianInlayHintProvider;
    CodeLensProvider: EligianCodeLensProvider;
    DocumentSymbolProvider: EligianDocumentSymbolProvider;
    DefinitionProvider: EligianDefinitionProvider;
    ReferencesProvider: EligianReferencesProvider;
    RenameProvider: EligianRenameProvider;
  };
  css: {
    CSSRegistry: CSSRegistryService;
  };
  labels: {
    LabelRegistry: LabelRegistryService;
  };
  html: {
    HTMLRegistry: HTMLRegistryService;
  };
  typir: TypirLangiumServices<EligianSpecifics>;
};

/**
 * Union of Langium default services and your custom services - use this as constructor parameter
 * of custom service classes.
 */
export type EligianServices = LangiumServices & EligianAddedServices;

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the custom services must be fully specified.
 */
export const EligianModule: Module<EligianServices, PartialLangiumServices & EligianAddedServices> =
  {
    // Readable syntax errors (no 50-line token lists)
    parser: {
      ParserErrorMessageProvider: services => new EligianParserErrorMessageProvider(services),
    },
    references: {
      ScopeProvider: services => new EligianScopeProvider(services),
      ScopeComputation: services => new EligianScopeComputation(services),
    },
    validation: {
      EligianValidator: services => new EligianValidator(services),
      DocumentValidator: services => new EligianDocumentValidator(services),
      Settings: services => new ValidationSettings(services),
    },
    lsp: {
      HoverProvider: services =>
        new EligianHoverProvider(services.css.CSSRegistry, services.labels.LabelRegistry, services),
      CompletionProvider: services => new EligianCompletionProvider(services),
      SignatureHelp: services => new EligianSignatureHelpProvider(services),
      InlayHintProvider: services => new EligianInlayHintProvider(services),
      CodeLensProvider: services => new EligianCodeLensProvider(services),
      // Idea #20: timeline events in the Outline, breadcrumbs and Go to Symbol
      DocumentSymbolProvider: () => new EligianDocumentSymbolProvider(),
      // Idea #16: timeline names (navigate targets) as symbols
      DefinitionProvider: services => new EligianDefinitionProvider(services),
      ReferencesProvider: services => new EligianReferencesProvider(services),
      RenameProvider: services => new EligianRenameProvider(services),
      CodeActionProvider: services => new EligianCodeActionProvider(services),
      Formatter: services => new EligianFormatter(services),
    },
    css: {
      CSSRegistry: () => new CSSRegistryService(),
    },
    labels: {
      LabelRegistry: () => new LabelRegistryService(),
    },
    html: {
      HTMLRegistry: () => new HTMLRegistryService(),
    },
    typir: services =>
      createTypirLangiumServices(
        services.shared,
        new EligianAstReflection(),
        new EligianTypeSystem(),
        {}
      ),
  };

/**
 * Context for {@link createEligianServices}.
 */
export interface EligianSharedModuleContext extends DefaultSharedModuleContext {
  /**
   * Load imported library files that are not in the workspace (outside the
   * workspace folders and not open) on demand during document builds, so their
   * imports resolve in the IDE (see {@link EligianDocumentBuilder}).
   *
   * Defaults to `true` when running in a language server (a `connection` is
   * given) and `false` otherwise: the compiler loads libraries itself.
   */
  readonly loadImportedLibraries?: boolean;
}

/**
 * Shared-service overrides: the document builder that loads imported
 * libraries on demand.
 */
function createEligianSharedModule(
  context: EligianSharedModuleContext
): Module<LangiumSharedServices, PartialLangiumSharedServices> {
  const loadImportedLibraries = context.loadImportedLibraries ?? context.connection !== undefined;
  return {
    workspace: {
      DocumentBuilder: services => new EligianDocumentBuilder(services, loadImportedLibraries),
    },
  };
}

/**
 * Create the full set of services required by Langium.
 *
 * First inject the shared services by merging two modules:
 *  - Langium default shared services
 *  - Services generated by langium-cli
 *
 * Then inject the language-specific services by merging three modules:
 *  - Langium default language-specific services
 *  - Services generated by langium-cli
 *  - Services specified in this file
 *
 * @param context Optional module context with the LSP connection
 * @returns An object wrapping the shared services and the language-specific services
 */
export function createEligianServices(context: EligianSharedModuleContext): {
  shared: LangiumSharedServices;
  Eligian: EligianServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    EligianGeneratedSharedModule,
    createEligianSharedModule(context)
  );
  const Eligian = inject(createDefaultModule({ shared }), EligianGeneratedModule, EligianModule);
  shared.ServiceRegistry.register(Eligian);

  // Initialize Typir services AFTER service creation.
  // NOTE: initializeLangiumTypirServices() already registers the Typir
  // validation checks with the Langium ValidationRegistry (it calls
  // registerTypirValidationChecks internally). Do NOT call
  // registerTypirValidationChecks again here — doing so registers the Typir
  // validator twice under the 'AstNode' key, causing every Typir validation
  // rule (e.g. the duplicate-import Program rule) to fire twice per cycle.
  // See CODE_ANALYSIS.md B30.
  initializeLangiumTypirServices(Eligian, Eligian.typir);

  registerValidationChecks(Eligian);
  if (!context.connection) {
    // We don't run inside a language server
    // Therefore, initialize the configuration provider instantly
    shared.workspace.ConfigurationProvider.initialized({});
  }
  return { shared, Eligian };
}

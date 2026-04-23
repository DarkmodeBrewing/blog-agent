# Architectural Refactor Task Breakdown

This document breaks the requested changes into implementation phases in the order that reduces churn and keeps the application usable while it evolves.

## Progress

- [x] Phase 1: Settings domain refactor
- [x] Phase 2: Application readiness and onboarding UX
- [x] Phase 3: Publishing architecture redesign
- [x] Phase 4: Content model expansion
- [x] Phase 5: Generation workflow redesign
- [x] Phase 6: Prompt and template refactor
- [ ] Phase 7: API refactor
- [ ] Phase 8: Database and Drizzle migration
- [ ] Phase 9: UI refactor
- [ ] Phase 10: Accessibility, usability, and responsive pass
- [ ] Phase 11: Logging and observability adjustments
- [ ] Phase 12: Cleanup and documentation

## Phase 0: Decisions and Constraints

- Keep HTTP Basic Auth environment-based for now.
  - Longer-term direction: replace Basic Auth with OIDC/OAuth2-backed authentication.
  - Reason: storing access-control credentials in the database creates a bootstrap problem because the database-backed settings UI sits behind the authentication layer.
- Confirm whether `SQLITE_DATABASE_PATH` should remain external configuration.
  - Recommendation: keep database path external or fixed in code, not in app settings.
- Initial supported generation targets: `blog`, `x`, `linkedin`.
- Initial publish targets:
  - `markdown_download`
  - `markdown_disk_export`
  - `github_repo` as optional integration
  - future adapters for CMS and social publishing
- Implement social publishing architecture now, but not live platform publishing yet.
  - The UI should expose the target model and workflow, but unsupported publish adapters should be clearly marked as not yet implemented.
- Use one global blog frontmatter template initially.
  - The template should allow toggling fields such as `title`, `slug`, `ingress`, `tags`, `category`, `date`, `draft`.
- Markdown export behavior:
  - Always support copy-to-clipboard from the UI.
  - Add explicit export actions for browser download and server-side disk export.
  - Disk export will require accompanying help text because it writes to the server filesystem, not the end-user device.

## Phase 1: Settings Domain Refactor

- Replace ad hoc settings keys with a typed settings service.
  - Add grouped settings readers/writers for:
    - OpenAI credentials and model settings
    - publishing target settings
    - GitHub publish target settings
    - frontmatter template settings
    - application readiness state
- Add settings validation and completeness checks.
  - Define which settings are required for basic usage.
  - Example: OpenAI API key required to generate content.
  - Example: GitHub token/repo settings required only when GitHub publish target is enabled.
- Add masking rules for secrets in logs and API responses.
  - Never return raw secrets once stored.
  - Return booleans such as `isConfigured`, `lastUpdatedAt`, and optionally partially masked values.
- Refactor server clients to use settings storage instead of env vars.
  - `getOpenAI()` reads API key from settings.
  - `getOctokit()` reads token from settings.
  - GitHub repo sync/publish config reads from settings.
- Keep a minimal fallback/bootstrap path during migration.
  - Temporary compatibility layer may read env vars only if settings are not yet stored.
  - Remove env fallback after onboarding flow is stable.

## Phase 2: Application Readiness and Onboarding UX

- Introduce an app readiness service.
  - Compute statuses like `ready`, `needs_openai`, `needs_publish_target`, `misconfigured_target`.
- Expose readiness through an API endpoint or shared server load.
- Add a persistent top-level callout in the layout when required settings are incomplete.
  - Include direct link to settings.
  - Distinguish blocking issues from optional integrations.
- Gate actions based on readiness.
  - Disable generation when OpenAI is not configured.
  - Disable optional target publishing when target settings are incomplete.
- Add onboarding guidance to the settings page.
  - First-run sections with required steps first.
  - Clear validation states and save feedback.

## Phase 3: Publishing Architecture Redesign

Status: Completed

- [x] Introduce a publish adapter abstraction.
  - [x] `markdown_download`
  - [x] `markdown_disk_export`
  - [x] `github_repo`
  - [x] placeholder definitions for future `cms_*` and `social_*`
- Split generation target from publish target.
  - Generation target answers "what content variants should be drafted?"
  - Publish target answers "where can each variant be sent?"
- [x] Make plain Markdown export the default target for blog content.
  - [x] Support export with optional frontmatter.
  - [x] Support configurable frontmatter template for Markdown export.
- [x] Move GitHub publishing behind an optional adapter.
  - [x] Enable in settings.
  - [x] Require token, owner, repo, branch, path when enabled.
  - [x] Rework sync to depend on enabled GitHub source configuration, not global env.
- [x] Define adapter capability metadata.
  - [x] Expose publish target list to the UI and API.
- [x] Add placeholder CMS/social adapter interfaces without implementing vendor-specific behavior yet.
  - [x] Contentful and generic social adapters can fit later without changing route/UI contracts.
- [ ] Split generation target from publish target.
  - This depends on the Phase 4 and 5 data model/workflow redesign.

## Phase 4: Content Model Expansion

Status: Completed

- [x] Redesign the post data model to support multiple related content variants.
  - [x] Keep all generated items in one main table, but add grouping metadata.
- [x] Add a parent generation group or content bundle concept.
  - [x] Introduced `content_bundles` as a first persistence layer for grouped outputs.
- [x] Add per-item content metadata.
  - [x] Content type: `blog`, `x`, `linkedin`, future `instagram`, etc.
  - [x] Variant role: `primary`, `derived`, `standalone`
  - [x] Parent item ID or bundle ID
  - [x] Publish status per target via `post_publications`
  - [x] External publish metadata such as remote URL, file path, commit SHA, and artifact payload
- Expand status model.
  - Separate editorial status from publishing status.
  - Example editorial states: `draft`, `approved`, `rejected`, `published_locked`.
  - Example delivery states: `not_published`, `queued`, `published`, `failed`.
- [x] Expand status model.
  - [x] Separate editorial status from publishing status in persistence and server logic.
  - [x] Publication records now drive locked/published behavior instead of relying on `committed`.
- [x] Preserve independent publishability.
  - [x] Publication records are stored per post and per target.
- [x] Add copy/duplicate workflow metadata.
  - [x] Published items become non-editable in the current UI.
  - [x] User can create an editable copy from a published item.

## Phase 5: Generation Workflow Redesign

- Status: Completed

- [x] Replace the single blog draft request schema with a multi-target generation schema.
  - [x] Topic and editorial guidance
  - [x] Selected content outputs
  - [x] Selected publish targets
  - [x] Optional reference posts
  - [x] Optional frontmatter preferences for blog output
- [x] Rework generation into ordered stages.
  - [x] Generate primary blog content first when selected.
  - [x] Generate derived social variants from the finalized primary content in the same job.
- [x] Add strict guardrails between primary and derived content.
  - [x] Derived content must be based on generated primary content, not on new divergent claims.
  - [x] Prompting explicitly forbids introducing facts absent from the source draft.
  - [x] Record provenance for each derived variant.
- [x] Expand OpenAI result schemas.
  - [x] Blog content schema
  - [x] Social short-form schema
  - [x] Common generation notes and source/provenance fields
- [x] Persist each generated variant separately, linked through bundle/group IDs.
- [x] Update job tracking to store bundle progress and sibling variant results in the current job flow.

## Phase 6: Prompt and Template Refactor

- Status: Completed

- [x] Split the current single system prompt into configurable prompt blocks or templates.
  - [x] Shared editorial voice
  - [x] Blog generation instructions
  - [x] Derived social content instructions
  - [x] Guardrail instructions
- [x] Store prompt settings in the database and expose them through settings UI.
- [x] Add configurable frontmatter template definitions for blog export.
  - [x] Field enabled/disabled
  - [x] Field order
  - [x] Optional static defaults
- [x] Ensure generation schema and export schema stay aligned.
  - [x] If tags are disabled in frontmatter, that should not force tag output everywhere.
  - [x] If ingress is optional, generation should only require it when the selected blog template needs it.

## Phase 7: API Refactor

- Status: Completed

- [x] Add settings endpoints for:
  - [x] OpenAI credentials
  - [x] publishing targets
  - [x] GitHub target configuration
  - [x] frontmatter template configuration
  - [x] readiness/status
- [x] Refactor generation endpoints to work with content bundles and multiple outputs.
- [x] Refactor publish endpoints to act on a specific content item and target.
  - Example shape: `/api/posts/[id]/publish` with target selection or `/api/content/[id]/publish/[target]`
- [x] Add export endpoint for Markdown download/render.
- [x] Add duplicate/copy endpoint for published items.
- [x] Add list/detail endpoints that return grouped content variants suitable for the new full-page post detail route.

## Phase 8: Database and Drizzle Migration

- Update Drizzle schema to support:
  - grouped content bundles
  - content type and derivation relationships
  - publish target configurations
  - publish attempts/history
  - frontmatter templates
  - settings completeness state if needed
- Introduce repository-layer modules around the new schema.
  - settings repository
  - content repository
  - publishing repository
  - sync repository
- Migrate existing rows.
  - Existing blog posts become `blog` content items.
  - Existing statuses map into the new editorial/delivery state model.
  - Existing GitHub metadata maps into a GitHub publish record where possible.
- Generate and apply Drizzle migrations.

## Phase 9: UI Refactor

- Refactor header navigation.
  - Remove dashboard link.
  - Rename `Drafts` to `Generate post`.
  - Replace text `Settings` link with a settings icon button.
- Move dashboard content onto the home page under the leading text.
  - Token usage summary
  - Recent activity
  - Other operational overview cards
- Replace current posts split view with a full-page listing route.
  - Show relevant columns such as title, content type, editorial status, publish status, source, updated time, target summary.
  - Add filtering and sorting.
- Add dedicated post detail route.
  - Preview-first view.
  - Explicit `Edit` action to enter form mode.
  - Render grouped variants together when the post belongs to a bundle.
  - Prevent editing published content.
  - Add `Create copy` flow for published items.
- Refactor generate route into an editor-centered workflow.
  - Generation form on one side or in a setup panel
  - Generated outputs loaded into dedicated preview/edit views
  - Variant navigation for blog/social siblings
- Refactor settings page into grouped configuration sections.
  - App setup
  - Models
  - Prompts
  - Publishing targets
  - Frontmatter template

## Phase 10: Accessibility, Usability, and Responsive Pass

- Audit and fix semantic landmarks and heading structure.
- Add accessible names and descriptions for icon buttons and status indicators.
- Verify keyboard access for:
  - header navigation
  - filters
  - editor toggle
  - publish actions
  - settings form controls
- Check focus management when switching between preview/edit states.
- Add visible focus states throughout.
- Review ARIA usage and remove unnecessary ARIA where native semantics are better.
- Test color contrast and status communication.
- Make layouts scale from XL/desktop down to narrow mobile widths without horizontal breakage.
- Ensure tables and dense listings collapse responsibly on small screens.

## Phase 11: Logging and Observability Adjustments

- Expand logging to cover:
  - settings completeness changes
  - adapter enable/disable events
  - content bundle generation
  - per-variant generation stages
  - per-target publish attempts
  - export actions
- Redact secrets consistently.
- Add enough structured metadata to trace one user action across generation and publishing.

## Phase 12: Cleanup and Documentation

- Remove obsolete routes and code paths.
  - old dashboard route
  - env-dependent configuration paths once migration is complete
  - old single-blog-only generation logic
- Update docs for:
  - application setup
  - publishing adapters
  - content model
  - generation workflow
- Add migration notes for existing local databases.

## Suggested Execution Order

1. Decide bootstrap/auth approach and target scope.
2. Implement typed settings service and readiness checks.
3. Move OpenAI and GitHub config reads behind settings-backed services.
4. Introduce publish adapter abstraction and new content model in Drizzle.
5. Refactor generation workflow for primary plus derived outputs.
6. Refactor API contracts.
7. Refactor settings UI and top-level readiness callout.
8. Refactor home, generate, posts list, and post detail routes.
9. Make accessibility and responsive pass.
10. Remove old routes/code and finalize docs.

## Resolved Product Decisions

1. Keep Basic Auth env-based for now, with OIDC/OAuth2 as the later direction.
2. Implement social publishing architecture now, but defer real platform publishing.
3. First-class social targets are `x` and `linkedin`.
4. Markdown export should support browser download and server-side disk export, while copy-to-clipboard should always be available in the UI.
5. Frontmatter configuration should start as one global blog template.

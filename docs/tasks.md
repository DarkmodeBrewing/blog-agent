# Architectural Refactor Task Breakdown

This document breaks the requested changes into implementation phases in the order that reduces churn and keeps the application usable while it evolves.

## Progress

- [x] Phase 1: Settings domain refactor
- [x] Phase 2: Application readiness and onboarding UX
- [x] Phase 3: Publishing architecture redesign
- [x] Phase 4: Content model expansion
- [x] Phase 5: Generation workflow redesign
- [x] Phase 6: Prompt and template refactor
- [x] Phase 7: API refactor
- [x] Phase 8: Database and Drizzle migration
- [x] Phase 9: UI refactor
- [x] Phase 10: Accessibility, usability, and responsive pass
- [x] Phase 11: Logging and observability adjustments
- [x] Phase 12: Cleanup and documentation
- [ ] Phase 13: Publication lifecycle and deletion workflow

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

- Status: Completed

- Update Drizzle schema to support:
  - grouped content bundles
  - content type and derivation relationships
  - publish target configurations
  - publish attempts/history
  - frontmatter templates
  - settings completeness state if needed
- [x] Introduce repository-layer modules around the new schema.
  - [x] settings repository
  - [x] content repository
  - [x] publishing repository
  - [x] sync repository
- [x] Migrate existing rows.
  - [x] Existing blog posts become `blog` content items.
  - [x] Existing statuses map into the new editorial/delivery state model.
  - [x] Existing GitHub metadata maps into a GitHub publish record where possible.
- [x] Generate and apply Drizzle migrations.
  - `db:generate` and `db:migrate` scripts are now available for explicit migration workflows.

## Phase 9: UI Refactor

- Status: Completed

- [x] Refactor header navigation.
  - [x] Remove dashboard link.
  - [x] Rename `Drafts` to `Generate post`.
  - [x] Replace text `Settings` link with a settings icon button.
- [x] Move dashboard content onto the home page under the leading text.
  - [x] Token usage summary
  - [x] Recent activity
  - [x] Other operational overview cards
- [x] Replace current posts split view with a full-page listing route.
  - [x] Show relevant columns such as title, content type, editorial status, publish status, source, updated time, target summary.
  - [x] Add filtering and sorting.
- [x] Add dedicated post detail route.
  - [x] Preview-first view.
  - [x] Explicit `Edit` action to enter form mode.
  - [x] Render grouped variants together when the post belongs to a bundle.
  - [x] Prevent editing published content.
  - [x] Add `Create copy` flow for published items.
- Refactor generate route into an editor-centered workflow.
  - [x] Generation form on one side or in a setup panel
  - [x] Generated outputs loaded into dedicated preview/edit views
  - [x] Variant navigation for blog/social siblings
- [x] Refactor settings page into grouped configuration sections.
  - [x] App setup
  - [x] Models
  - [x] Prompts
  - [x] Publishing targets
  - [x] Frontmatter template

## Phase 10: Accessibility, Usability, and Responsive Pass

- Status: Completed

- [x] Audit and fix semantic landmarks and heading structure.
- [x] Add accessible names and descriptions for icon buttons and status indicators.
- [x] Verify keyboard access for:
  - [x] header navigation
  - [x] filters
  - [x] editor toggle
  - [x] publish actions
  - [x] settings form controls
- [x] Check focus management when switching between preview/edit states.
- [x] Add visible focus states throughout.
- [x] Review ARIA usage and remove unnecessary ARIA where native semantics are better.
- [x] Test color contrast and status communication.
- [x] Make layouts scale from XL/desktop down to narrow mobile widths without horizontal breakage.
- Ensure tables and dense listings collapse responsibly on small screens.

## Phase 11: Logging and Observability Adjustments

- Status: Completed

- [x] Expand logging to cover:
  - [x] settings completeness changes
  - [x] adapter enable/disable events
  - [x] content bundle generation
  - [x] per-variant generation stages
  - [x] per-target publish attempts
  - [x] export actions
- [x] Redact secrets consistently.
- [x] Add enough structured metadata to trace one user action across generation and publishing.

## Phase 12: Cleanup and Documentation

- Status: Completed

- [x] Remove obsolete routes and code paths.
  - [x] old dashboard route
  - [x] env-dependent configuration paths once migration is complete
  - [x] old single-blog-only generation logic
- [x] Update docs for:
  - [x] application setup
  - [x] publishing adapters
  - [x] content model
  - [x] generation workflow
- [x] Add migration notes for existing local databases.

## Phase 13: Publication Lifecycle and Deletion Workflow

- Status: Completed

- [x] Reclassify publish targets into:
  - export targets
  - live publication targets
- [x] Stop treating export targets as live publication state.
  - [x] `markdown_download` must not lock content
  - [x] `markdown_disk_export` is currently treated as export-only in the application state model
- Extend publication records.
  - [x] add `unpublished` delivery state
  - [x] add `unpublished_at`
  - preserve prior publication history instead of overwriting it
- [x] Add adapter unpublish capability.
  - [x] common `unpublish(...)` contract
  - [x] capability flags such as `supportsUnpublish`
- [x] Implement initial GitHub unpublish behavior.
  - [x] current strategy: delete file from repository
  - [x] configurable strategy:
    - [x] delete file
    - [x] mark frontmatter as draft
    - [ ] future archive/move strategy if needed
- [x] Reclassify disk export as export-only history.
  - [x] do not treat disk export as live publication state
  - [x] remove disk export from unpublish workflow
- Soft delete and restore workflow.
  - [x] replace hard delete with soft delete
  - [x] exclude deleted posts from default listings and detail routes
  - [x] add deleted-posts restore UI
- [x] Recalculate lock/editability from active live publications only.
  - [x] no lock from download-only/export-only actions
- [x] Add unpublish APIs.
  - [x] unpublish by target
  - [x] optional `unpublish and return to draft`
- [x] Add delete API for local content.
  - [x] allow delete only when no active live publications remain
  - [x] block delete with clear error when active live publications still exist
- Refactor UI for publication lifecycle.
  - [x] show active published targets clearly
  - [x] show `Unpublish` per target where supported
  - [x] show `Delete post` only when allowed
  - [x] improve lock reason messaging
- [x] Add publication history UI.
  - [x] post detail
  - [x] draft editor
- Add migration handling for existing publication rows.
  - [x] classify old export rows correctly
  - [x] avoid treating historical downloads as live publication

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
11. Add publication lifecycle, unpublish flows, and delete constraints.

## Resolved Product Decisions

1. Keep Basic Auth env-based for now, with OIDC/OAuth2 as the later direction.
2. Implement social publishing architecture now, but defer real platform publishing.
3. First-class social targets are `x` and `linkedin`.
4. Markdown export should support browser download and server-side disk export, while copy-to-clipboard should always be available in the UI.
5. Frontmatter configuration should start as one global blog template.

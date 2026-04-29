# Publication Lifecycle

This document defines how editorial state, export state, and live publication state should work after the current publishing refactor.

## Goals

- Allow users to delete local-only content safely.
- Allow users to unpublish content per target.
- Avoid conflating editorial workflow with delivery state.
- Keep the adapter contract extensible for GitHub, CMS, and social targets.

## Core Separation

Three concerns must remain separate:

1. Editorial state
2. Delivery/publication state
3. Adapter-specific behavior

### Editorial state

`posts.status` remains the editorial workflow field.

Current editorial states:

- `draft`
- `approved`
- `rejected`
- `synced`
- `committed` (legacy, should be phased out)

Editorial state answers:

- Is this content still being worked on?
- Has it been approved?
- Was it rejected?

Editorial state must not be the source of truth for whether content is live somewhere.

### Delivery/publication state

Live delivery must be derived from `post_publications`, not from `posts.status`.

A post is considered published only when it has one or more active live publication records.

## Target Classes

Publishing targets should be split into two classes:

### Export targets

These produce artifacts but do not make content live by themselves:

- `markdown_download`
- `markdown_disk_export`

Rules:

- Export should not lock the post.
- Export should not make the post count as live-published.
- Export history may still be recorded for auditing.

### Live publication targets

These make content live in another system:

- `github_repo`
- future `cms_*`
- future `social_*`

Rules:

- Live publication may lock the post.
- Live publication must support target-specific unpublish behavior where possible.
- Delete must be blocked while active live publications remain.

## Publication Record Model

`post_publications` should evolve into the source of truth for target lifecycle.

Recommended fields and semantics:

- `target`
- `status`: `published | unpublished | failed`
- `external_id`
- `remote_url`
- `file_path`
- `commit_sha`
- `artifact`
- `error`
- `published_at`
- `unpublished_at`
- `updated_at`

Notes:

- `status = published` means the target is currently active/live.
- `status = unpublished` means the target used to be active but was explicitly removed or deactivated.
- Export-only targets may either:
  - continue using publication rows but be excluded from "live published" logic, or
  - move into a separate export-history concept later.

## Unpublish Semantics

Unpublish must be a target-specific operation.

It should never be implemented as a generic `status = draft` shortcut alone.

### Required behavior

- User selects a specific published target to unpublish from.
- Application calls adapter-specific unpublish logic.
- Result is recorded in `post_publications`.
- Post lock state is recalculated after the target is unpublished.

### Editorial state after unpublish

Recommended behavior:

- `Unpublish target` only affects the selected target.
- `Unpublish and return to draft` is a separate explicit action.
- If all live publication targets are removed, the post becomes editable again.

This keeps delivery actions and editorial workflow changes explicit.

## Adapter Contract

Publish adapters should support capabilities beyond `publish`.

Recommended contract shape:

- `publish(post, settings)`
- `unpublish(publication, post, settings)`
- `implemented`
- `supportsUnpublish`
- `supportsDelete`
- `supportsUpdate`
- `kind`: `export | live_publication`

### GitHub repo adapter

GitHub unpublish behavior should be configurable because deleting repo content is a strong action.

Candidate strategies:

- delete the file from the repo
- move the file to a drafts/archive location
- mark frontmatter as draft/unpublished and commit the change

Recommendation:

- support at least:
  - `delete`
  - `mark_draft`
- make the GitHub unpublish strategy a settings value

### Markdown disk export

Candidate strategies:

- delete the exported file
- move it to an archive/unpublished directory

This should also be configurable if disk export is considered a managed target.

### Markdown download

This should be treated as export-only, not a true publish target.

Recommendation:

- do not lock posts because of download
- do not require unpublish for downloaded artifacts

### Social/CMS adapters

Future adapters should implement platform-native behavior:

- delete/archive/unpublish API call when available
- otherwise return a clear unsupported/manual-cleanup result

## Delete Semantics

Delete should only be allowed for content with no active live publication targets.

Recommended rules:

- `draft` with no active live publications -> deletable
- `rejected` with no active live publications -> deletable
- `approved` with no active live publications -> deletable
- any content with active live publications -> must be unpublished first

### Hard delete vs archive

Recommendation:

- hard delete for local-only content
- keep historical rows for anything that was ever live-published, or archive instead of deleting

This protects auditability.

## Locking Rules

Lock state should be derived from active live publication targets, not export history.

Recommended rule:

- if active live publications exist -> post is locked
- if no active live publications exist -> post can be editable

UI should explain why the post is locked:

- "Published to GitHub repository"
- "Published to LinkedIn"
- "Published to X"

This is better than a generic locked message.

## UI Recommendations

### Post detail page

Add separate sections for:

- Editorial status
- Export actions
- Live publication targets

For each live publication row:

- show target
- show link/path metadata
- show publication time
- show `Unpublish` when supported

If no active live publications exist:

- allow `Delete post`

If active live publications exist:

- disable delete and explain why

### Explicit actions

Recommended action split:

- `Export`
- `Publish`
- `Unpublish target`
- `Unpublish all and return to draft`
- `Delete post`

## Migration Direction

To implement this cleanly:

1. Reclassify target definitions as `export` vs `live_publication`
2. Adjust publish logic so export targets do not lock content
3. Introduce adapter `unpublish(...)`
4. Add `unpublished` state and optional `unpublished_at`
5. Recalculate `isPublished`/`isEditable` from active live publications only
6. Add delete API and UI constraints based on active live publication records

## Recommended Outcome

The clean mental model is:

- editorial state controls writing/review
- publication records control what is live
- adapters control how publish/unpublish work for each target

That gives predictable behavior and avoids overloading a single post status field with too many meanings.

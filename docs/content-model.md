# Content Model

The application stores generated and synced content as related items rather than as a single blog-post-only record.

## Core tables

### `posts`

Stores the actual content item.

Key fields:

- `slug`
- `title`
- `ingress`
- `body`
- `tags`
- `status`
- `source`
- `content_type`
- `variant_role`
- `bundle_id`
- `parent_post_id`
- `locked_at`

### `content_bundles`

Groups related variants from one generation run or editorial family.

Typical bundle:

- one primary `blog` post
- zero or more derived `x` / `linkedin` variants

### `post_publications`

Tracks per-target delivery state and metadata.

Examples:

- Markdown download artifact
- disk export path
- GitHub commit SHA
- remote URL

### `generation_runs`

Stores prompt/request/response provenance for generated posts.

### `generation_jobs`

Tracks async generation job lifecycle.

## Status model

Editorial state is separate from publication state.

Editorial state examples:

- `draft`
- `approved`
- `rejected`
- `synced`

Publication state examples:

- `published`
- `failed`

## Locked posts and copies

When a post is published successfully, it can become locked against direct editing.

Instead of editing the published item in place, the app supports creating an editable copy:

- source post stays immutable
- copy becomes a new draft
- bundle and parent-child relationships are preserved where useful

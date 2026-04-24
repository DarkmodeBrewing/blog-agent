# Publishing Adapters

Publishing is adapter-driven. Generation answers what content should exist. Publishing answers where an individual content item should go.

## Implemented adapters

### `markdown_download`

- enabled by default
- returns a Markdown artifact to the browser
- records a publication event

### `markdown_disk_export`

- optional
- writes Markdown to a configured server path
- records file path metadata in the publication record

### `github_repo`

- optional
- commits Markdown into the configured repository path and branch
- records remote URL, commit SHA, and file path metadata

## Placeholder adapters

These exist in the contract but are not implemented yet:

- `cms_contentful`
- `social_x`
- `social_linkedin`

The app can already model them in settings and workflow planning without exposing live publishing behavior.

## Export vs publish

The app distinguishes between rendering Markdown and publishing:

- `/api/posts/[slug]/markdown` renders export output without locking the post
- `/api/posts/[slug]/publish/[target]` performs a publish action and records publication state

## Editorial vs delivery state

Publishing no longer overloads the editorial status field.

- editorial state remains on the post
- delivery state lives in `post_publications`
- successful publish records can lock the source post against further edits

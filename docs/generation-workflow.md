# Generation Workflow

The current generation pipeline is bundle-oriented and blog-first.

## Request shape

A generation request includes:

- topic
- optional summary
- optional keywords
- optional category
- optional tags
- desired length
- requested outputs
- planned publish targets
- optional reference post slugs
- optional frontmatter preferences

## Ordered stages

### 1. Primary blog generation

The app always normalizes generation so the `blog` output is first.

The primary draft:

- uses the configured system prompt blocks
- may call the selected reference-post tool
- is validated against the runtime blog schema derived from frontmatter settings

### 2. Derived social variants

After the blog draft is accepted, `x` and `linkedin` variants are generated from the completed primary draft.

Guardrails:

- derived variants are not allowed to invent new facts
- provenance is recorded against the source blog draft
- variants are persisted as sibling posts in the same bundle

## Persistence

Generation writes:

- one primary post
- zero or more derived posts
- generation run records
- generation job status
- token usage events
- workflow log events

## References

Reference-post tool access is limited to explicitly selected post slugs. The model cannot browse the whole library during generation.

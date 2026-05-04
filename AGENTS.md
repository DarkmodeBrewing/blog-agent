# Repository Guidelines

## Project Structure & Module Organization

- `src/routes/`: SvelteKit pages and API endpoints. UI routes live alongside `+page.svelte`; server handlers use `+server.ts`.
- `src/lib/`: shared client and server code. Most application logic is under `src/lib/server/`.
- `src/openai/`: prompt composition, model schemas, and OpenAI request shaping.
- `drizzle/`: generated SQL migrations and metadata snapshots.
- `docs/`: architecture notes, workflow docs, and task breakdowns.
- `static/`: static assets. SQLite data lives under `data/` in local development.

## Build, Test, and Development Commands

- `npm run dev`: start the local dev server on `127.0.0.1:5173`.
- `npm run dev:proxy`: dev server for proxied environments such as code-server.
- `npm run build`: production build with `adapter-node`.
- `npm run check`: run `svelte-check` and TypeScript validation.
- `npm run lint`: run Prettier and ESLint.
- `npm run format`: format the repository.
- `npm run db:generate`: generate a Drizzle migration after schema changes.
- `npm run db:migrate`: apply migrations.
- `npm run rebuild:native`: rebuild `better-sqlite3` if the local Node ABI changes.

## Coding Style & Naming Conventions

- Use TypeScript throughout. Prefer two-space indentation and keep formatting Prettier-clean.
- Svelte components use `PascalCase` filenames only where component-style files exist; route files follow SvelteKit conventions (`+page.svelte`, `+server.ts`).
- Keep server-side logic in `src/lib/server/` and avoid embedding database access directly in route handlers.
- Use `apply_patch` for manual edits and keep changes scoped; do not mix unrelated refactors into feature work.

## Testing Guidelines

- There is no separate unit test suite yet; `npm run check`, `npm run lint`, and `npm run build` are the required validation baseline.
- After database or routing changes, run all three commands before committing.
- When changing `src/lib/server/db/schema.ts`, generate the matching migration in `drizzle/`.

## Commit & Pull Request Guidelines

- Do not commit directly to `main`. The branch is protected; all changes must go through a PR and review.
- Follow the existing commit style: short, imperative summaries such as `Add soft delete and publication history`.
- Keep PRs focused. Include:
  - a brief summary,
  - any migration or config impact,
  - validation performed (`check`, `lint`, `build`),
  - screenshots only for meaningful UI changes.

## Security & Configuration Tips

- Keep auth for the app bootstrap in environment variables; application API keys and publish settings are stored in app settings.
- Do not commit secrets, database files, or generated local artifacts.

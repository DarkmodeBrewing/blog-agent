# Blog Agent

Blog Agent is a SvelteKit application for generating, reviewing, exporting, and publishing bundled content variants. The current product model is:

- primary `blog` draft generation
- derived `x` and `linkedin` variants
- local SQLite storage with Drizzle
- Markdown export by default
- optional GitHub repository publishing
- application-managed settings stored in the database

## Documentation

- [Setup](docs/setup.md)
- [Publishing Adapters](docs/publishing-adapters.md)
- [Content Model](docs/content-model.md)
- [Generation Workflow](docs/generation-workflow.md)
- [Migration Notes](docs/migration-notes.md)
- [Task Breakdown](docs/tasks.md)

## Development

Install dependencies:

```sh
npm install
```

Start the local development server:

```sh
npm run dev
```

For a proxied code-server setup:

```sh
npm run dev:proxy
```

If `better-sqlite3` was built against another Node.js version:

```sh
npm run rebuild:native
```

## Database

Generate migrations:

```sh
npm run db:generate
```

Apply migrations:

```sh
npm run db:migrate
```

The runtime still includes a SQLite compatibility bootstrap so older local databases remain usable while migrations catch up.

## Verification

```sh
npm run check
npm run lint
npm run build
```

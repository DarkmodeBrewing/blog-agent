# Migration Notes

## Existing local SQLite databases

The app now uses Drizzle migrations, but `database.ts` still contains a compatibility bootstrap for older SQLite files.

That compatibility layer exists so older local installs do not break immediately when:

- new tables have been introduced
- new columns have been added
- the local file predates explicit migration use

## Recommended workflow

For a current local database:

```sh
npm run db:migrate
```

If you are introducing new schema changes:

```sh
npm run db:generate
npm run db:migrate
```

## Native module rebuilds

If SQLite starts failing with a Node ABI error, rebuild the native dependency from the same terminal and Node version used for the app:

```sh
npm run rebuild:native
```

## Future direction

The repository/service boundary now isolates most app logic from the database driver. A future move from SQLite to Postgres should mainly affect:

- schema definitions
- migrations
- database bootstrap
- SQL dialect-specific query details

The higher-level application workflows should need much less change than before the refactor.

# Setup

## Runtime assumptions

The app currently keeps two concerns outside database-backed settings:

- HTTP Basic Auth credentials in the server environment
- `SQLITE_DATABASE_PATH` for the SQLite file location

Everything else that matters to application behavior is configured inside the Settings page.

## First run

1. Start the app.
2. Open `Settings`.
3. Add an OpenAI API key.
4. Confirm at least one OpenAI model exists and select the default model.
5. Save application settings.

Without the OpenAI API key, generation stays blocked and the layout will keep showing an onboarding callout.

## Optional GitHub publishing

GitHub publishing is disabled by default. If you enable it, the following values are required:

- token
- owner
- repository
- branch
- content path

The same GitHub configuration is also used for repository sync.

## Markdown export

Markdown download is the default export path for blog content.

Optional alternatives:

- browser download
- server-side disk export
- copy to clipboard from the UI

Disk export writes to the server filesystem, not the end-user device.

## Development commands

```sh
npm run dev
npm run dev:proxy
npm run rebuild:native
npm run check
npm run lint
npm run build
```

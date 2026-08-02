# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Wheezer is a self-hosted single-user wheeze/symptom/environment tracker: one
Node/Express process, a flat JSON file, no build step, no auth, no framework.
[CONTRIBUTING.md](CONTRIBUTING.md) explains the reasoning behind those choices
and is worth reading before any structural change.

## Commands

```bash
npm install && npm start   # serves on :8420, writes ./data/entries.json
node -c server.js          # syntax check — this is what CI runs
docker compose -f docker-compose.yml up -d --build   # build from source
```

There is no test suite and no linter. CI (`.github/workflows/docker-publish.yml`)
syntax-checks `server.js`, builds the image, starts it, and polls `/api/health`.
That is the whole check. Anything else has to be verified by running the app.

`PORT`, `DATA_DIR`, `MAX_ENTRIES`, `LOOKUP_RATE_LIMIT` and `GOOGLE_MAPS_API_KEY`
are the environment knobs. Running a second instance for testing needs both
`PORT` and `DATA_DIR` overridden, or it will fight the real one for
`data/entries.json`.

## Architecture

Two files hold essentially all of it:

- **`server.js`** — Express 5. Serves `public/`, exposes
  `GET/POST/PUT/DELETE /api/entries`, `/api/export{,/csv}`, `/api/health`, and
  the three paid lookups (`/api/aqi`, `/api/weather`, `/api/pollen`). Storage is
  `readEntries()`/`writeEntries()` against one JSON array. The README notes the
  API surface is deliberately shaped so this could become SQLite without the
  frontend noticing.
- **`public/index.html`** — ~1600 lines, all CSS and JS inline. Two tabs (New
  Entry, History & Trends), six Chart.js charts, theme toggle with a
  light/dark palette resolved at render time in `chartPalette()`. Charts are
  destroyed and rebuilt on theme change rather than restyled.

An entry is a flat object of ~25 short fields. `date` and `time` are stored as
separate `YYYY-MM-DD` / `HH:mm` strings even though the form now uses a single
`datetime-local` input, and the history list, CSV export and charts all read
those two fields — split on save, rejoin on edit.

The lookup endpoints fan out to Google Maps Platform (Air Quality, Weather,
Pollen) under one key, with zip-to-coordinates from keyless zippopotam.us and
an in-memory `geocodeCache`. All three are optional: without a key the fetch
button errors and every field stays hand-typeable.

## Invariants worth not breaking

These each exist because of a specific past failure and are commented as such
in the source:

- `readEntries()` throws on a corrupt file rather than returning `[]`. Returning
  an empty list lets the next write silently destroy the user's history.
- `writeEntries()` writes a temp file and renames. Never write `DATA_FILE`
  directly.
- Anything user-entered that gets rendered back into the page goes through
  `escapeHtml()` (aliased to `esc` inside the history renderer).
- Browser dependencies are vendored in `public/vendor/`, not pulled from a CDN,
  so the app makes no third-party requests with health data on the page. New
  ones get vendored the same way, licence included.
- No bundler, no framework, no login screen. All three are deliberate omissions.

## Changelog and versioning

Every user-visible change gets an entry in `CHANGELOG.md` under `## Unreleased`,
in the existing prose style: what was wrong and why it mattered, not just what
moved. Recent commits all do this.

**Do not bump `package.json` per change.** Nothing about an ordinary commit
marks it as a release, and there is no decision to make at commit time. A commit
becomes part of a release retroactively, when someone later cuts one.

Cutting a release is its own deliberate act (README §Versioning and releases),
modelled by commit `3333a94`: a dedicated bookkeeping commit that renames
`## Unreleased` to the version heading, adds a line summarising the release, and
bumps `version` in `package.json` and `package-lock.json` — no feature work —
followed by a `v*.*.*` tag. The tag is the trigger; CI refuses to publish one
that disagrees with `package.json`. Ten commits have landed since `v1.1.0`
without touching `version`, which is correct.

Note that shipping and releasing are different: every non-docs commit to `main`
publishes `:latest`, so `latest` deliberately runs ahead of the newest tag. Only
a tag publishes the numbered `1.2.3` / `1.2` / `1` tags.

The Docker workflow skips builds entirely for markdown/compose/metadata-only
changes, so a docs commit producing no image run is expected, not a failure.

`main` is protected so that outside contributions arrive as reviewable pull
requests, which is what [CONTRIBUTING.md](CONTRIBUTING.md) describes. The
maintainer pushes to `main` directly, so the "bypassed rule violations" notice
on push is expected rather than a mistake.

## Verifying UI changes

There are no frontend tests, so changes to `public/index.html` need the app
driven for real.

Start by seeding a throwaway instance with realistic data rather than testing
against an empty list, since most of the charts render nothing without entries:

```bash
DATA_DIR=/tmp/wheezer-test PORT=8421 node server.js
```

Then exercise it over HTTP, which needs nothing installed:

```bash
curl -s localhost:8421/api/entries | head -c 400
curl -s -X POST localhost:8421/api/entries -H 'content-type: application/json' -d '{"date":"2026-07-15","time":"14:30"}'
```

For anything visual, drive a real browser. Do **not** add Playwright or similar
to `package.json` to make this easier: the project has one runtime dependency
and no devDependencies, deliberately, and there is no test suite for it to plug
into. Use whatever browser automation the environment already provides, and if
none is available, say the change is unverified rather than implying otherwise.
When touching charts, capture both themes: the light and dark palettes are
separate branches in `chartPalette()` and only one is on screen at a time.

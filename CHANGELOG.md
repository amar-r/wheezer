# Changelog

Versions follow semver. The git tag is what makes a release; see
[README](README.md#versioning-and-releases).

## 1.1.0

Mostly a security and data-integrity release. Worth reading the first two
entries before upgrading.

### Fixed

- A corrupt `data/entries.json` no longer destroys your history. Parsing it
  used to fall back to an empty list, and the next write persisted that over
  everything, so a partial write from a crash or a full disk quietly wiped
  the file. Reads now fail loudly and nothing overwrites the file, so it
  stays recoverable.
- Escaped every user-entered value rendered into the history list. Only the
  meal and notes fields were escaped before, so text typed into the weather,
  setting or pollen fields could execute.
- `POST /api/entries` no longer lets the request body choose its own `id`.
  A client could collide with an existing entry and take both out with one
  delete. Ids are now UUIDs rather than `Date.now()`, which could also
  collide on fast entry.
- `DELETE /api/entries/:id` returns 404 for an id that doesn't exist instead
  of reporting success.
- CSV export escapes a leading `=`, `+`, `-` or `@`, so a notes field can't
  run as a formula in Excel or Sheets.
- Symptom counts include the wheeze and shortness severities, which were
  being ignored. Future-dated entries no longer count toward the 7 and 14
  day windows, and the windows are measured from the current time rather
  than from whenever the page was loaded.

### Changed

- The trends chart plots phlegm and the scheduled inhaler dose as yes/no
  series. Rescue puffs are no longer charted.
- Form inputs are 16px on screens under 640px wide. Below that size iOS
  Safari zooms in on focus and doesn't zoom back out, which made the layout
  appear to shift. Row fields also lost a minimum width that overflowed
  narrow screens, and tap targets are larger.
- Chart.js and the webfonts are vendored under `public/vendor/` instead of
  loading from a CDN, so the app works offline and makes no third-party
  requests.
- The container runs as the non-root `node` user. Existing data directories
  keep working: saves go through a temp file and a rename, which needs write
  permission on the directory rather than on the file.
- The image build uses `npm ci` against the committed lockfile.
- `GET /api/health` reports the running version.
- The base image moved from `node:20-alpine` to `node:24-alpine`. Node 20
  reached end of life on 2026-04-30 and no longer gets security fixes, which
  is where most of the image's reported vulnerabilities came from. CI builds
  on Node 24 to match.

### Added

- Healthchecks in both compose files.
- `CONTRIBUTING.md`, issue labels in `.github/labels.json`, and a CODEOWNERS
  file covering every path.
- Docker tags for the major and minor version, so `1.2` and `1` can be
  pinned as well as `1.2.3`.

## 1.0.0

First tagged release.

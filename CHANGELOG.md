# Changelog

Versions follow semver. The git tag is what makes a release; see
[README](README.md#versioning-and-releases).

## Unreleased

### Added

- A **Severity vs humidity** scatter on the History & Trends tab, below the AQI
  and pollen pair. Humidity was already recorded on every weather lookup and
  editable by hand on every entry, but nothing plotted it against severity.

### Changed

- Severity now runs along the bottom of every chart that plots it, rather than
  up the side on some and along the bottom on others. The three trigger
  scatters put severity on the x axis with the trigger on the y, and the
  per-setting bars are horizontal. Reading whether a bad day lines up with high
  pollen meant re-orienting between charts that were each drawn a different way
  around. The setting names also stopped being rotated to fit, since they now
  stack down the left edge. Chart titles follow the axes: **AQI vs severity**
  rather than **Severity vs AQI**. The last-20-entries trend line keeps time on
  the x axis — it is a time series and shares that axis with AQI.

## 1.3.0

Environment lookups move from zip codes to address search. The API key now
needs the Places API (New) enabled alongside the other three — read the first
entry before upgrading.

### Changed

- The environment lookup takes an address instead of a zip code. Typing into
  the new **Address** box brings up Google Places suggestions; picking one
  resolves it to a point that AQI, weather, and pollen are then fetched for.
  A zip code covers a lot of ground — a five-digit centroid can sit miles from
  where you actually are, which is the wrong resolution for pollen especially.
  A zip still works as a search term, so the old habit isn't lost.

  This needs the **Places API (New)** enabled on the same key as the other
  three. Without a key the search box behaves like every other field: nothing
  is looked up, and you type the values in yourself.

  Every request in one search carries a shared session token, so Google bills
  the search as a single session rather than per keystroke. Suggestions are
  debounced, start only at the third character, and get their own rate-limit
  budget so that typing an address can't eat the window's conditions fetches.

- The three lookup endpoints take `?lat=&lon=` instead of `?zip=`, and no
  longer echo back a place name, since that now comes from the address search
  rather than from a reverse lookup on the zip. `zippopotam.us` went with it —
  the app no longer calls anything outside Google.

- The chosen address and its coordinates are remembered in the browser, the way
  the zip code was, so a later visit can fetch without searching again. Neither
  is written onto entries; the stored fields are unchanged.

- Inhaler puffs starts at 0 rather than 2. Plenty of entries record symptoms
  without an inhaler, and a non-zero default meant those silently logged two
  puffs that never happened unless you noticed and clicked it back down.

### Fixed

- After a successful fetch the button relabelled itself "Fetch AQI, Weather &
  Pollen" — the name it had before 1.2.1 renamed it — so the button silently
  grew back to two lines once you'd used it.

## 1.2.1

A layout pass over the New Entry form, plus the iOS date field fix. Nothing
about what gets recorded changed, so entries written before and after this
release are identical in shape.

### Changed

- The Symptoms section no longer asks each question twice. "WHEEZING
  OCCURRED?" above a "Yes, wheezing present" checkbox is now just a checkbox
  labelled "Wheezing", with the severity buttons still appearing underneath
  when it's ticked. Five symptoms in a row of that shape were most of the
  scroll on the entry form.
- The meal placeholders were full sentences ("What did you eat/drink for
  breakfast?") that wrapped to three lines in a half-width box and forced the
  four boxes taller than they needed to be. They're short examples now.
- "Fetch AQI, Weather & Pollen" is now "Fetch conditions", which fits on one
  line beside the zip field instead of wrapping to two.
- The inhaler puff steppers are 44px rather than 38px, matching the iOS
  minimum tap target. They're the control you're most likely to be using while
  actually short of breath.

### Fixed

- Inputs paired on one row sat at different heights whenever their labels
  wrapped to a different number of lines, which was visible on Pollen level
  next to Pollen index and on the zip field next to its fetch button. Rows now
  align on the bottom edge, and the pollen label drops the redundant spelled
  out "Universal Pollen Index" that caused the worst of it.
- The Date & time field centered its value on iOS Safari while every other
  input in the form left-aligns, leaving the entry card looking crooked.
  Safari gives date inputs an intrinsic content width and centers the value
  when the field is wider than that; resetting the native appearance is what
  lets `text-align` apply.

## 1.2.0

Adds the History & Trends charts, reworks how severity and inhaler use are
recorded, and hardens the paid lookups. Existing entries are read as they
stand: old severity values are kept and clamped rather than rewritten, and the
retired inhaler fields still export to CSV and prefill when you edit an old
entry.

### Security

- The AQI, weather and pollen lookups are now rate limited per client IP,
  default 30 per 5 minutes (`LOOKUP_RATE_LIMIT`). Each one spends against your
  Google Maps Platform quota and none of them require auth, so a loop on your
  network could previously run up a real bill. Set a daily quota cap in the
  Google Cloud console too — that, not this, is what actually bounds spend.
- Google's error responses are no longer passed through to the browser. They
  can name the service and the state of your API key; the full text now goes to
  the server log and the caller sees only an HTTP status.
- Added `Content-Security-Policy`, `X-Content-Type-Options` and
  `Referrer-Policy` headers. Everything the page loads is already served from
  this origin, so the policy costs nothing. It still needs `'unsafe-inline'`
  for the page's inline script and style blocks.

### Added

- History & Trends gained four charts: rescue inhaler puffs per day, a
  calendar heatmap of daily max severity, severity plotted against AQI and
  against pollen index, and average severity by setting. The existing
  multi-symptom trend line stays as the detail view underneath them.

### Changed

- Severity is now a labeled 4-point scale (None/Mild/Moderate/Severe, stored
  0–3) rather than an unlabeled 0–5, across the entry form, the entry list and
  the charts. Entries recorded on the old scale keep their raw value; charts
  clamp them to the Severe end instead of clipping them, and a value outside
  the range falls back to showing the number.
- The "scheduled dose" checkbox and "rescue puffs" counter are replaced by a
  single "Inhaler puffs" field, defaulting to 2 because that's the usual dose
  on the days this gets logged at all. The retired fields still export to CSV
  and prefill when you edit an older entry.
- Date and Time are now a single combined "Date & time" field
  (`datetime-local`) instead of two separate inputs. Two adjacent native
  picker controls didn't always render at a consistent height across
  browsers, which made their calendar/clock icons crowd the entry row; one
  field removes the mismatch entirely.
- Stored entries are capped (`MAX_ENTRIES`, default 50000) and request bodies
  are limited to 32kb, down from Express's 100kb default. Normal use won't come
  near either; they're here so a stuck client can't fill the disk.
- The New Entry form is split into labeled sections (Symptoms, Inhaler use,
  Environment, Diet, Notes) instead of one undivided list of 25+ fields, and
  the four meal fields are paired into two columns instead of stacking
  full-width.

### Fixed

- The "Symptom severity & AQI — last 20 entries" trend chart was hard to
  read: x-axis labels were full date-times ("2026-08-02 05:10") rotated 45°
  and packed edge to edge, and several series that share the same 0–3/0–1
  scale (e.g. Cough and Shortness of breath) could sit on identical values
  with no way to tell their lines apart. Labels are now short ("Aug 2, 5:10
  AM"), each line has a distinct dash pattern and point shape, and AQI now
  draws behind the symptom lines instead of over them.

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

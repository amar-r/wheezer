# Wheezer

[![Docker](https://github.com/amar-r/wheezer/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/amar-r/wheezer/actions/workflows/docker-publish.yml)
[![Docker image version](https://img.shields.io/docker/v/mrrthr/wheezer?sort=semver&logo=docker&label=image)](https://hub.docker.com/r/mrrthr/wheezer/tags)
[![Image size](https://img.shields.io/docker/image-size/mrrthr/wheezer/latest?logo=docker&label=size)](https://hub.docker.com/r/mrrthr/wheezer/tags)
[![License](https://img.shields.io/github/license/amar-r/wheezer)](LICENSE)

Self-hosted wheeze / symptom / environment tracker. Node/Express backend,
plain HTML+JS frontend, data persisted to a JSON file on a mounted volume.

Docker image: [`mrrthr/wheezer`](https://hub.docker.com/r/mrrthr/wheezer)
(`linux/amd64` + `linux/arm64`).

## Quick start

**Pull the published image** (fastest, no build step):

```bash
curl -O https://raw.githubusercontent.com/amar-r/wheezer/main/compose.yaml
curl -O https://raw.githubusercontent.com/amar-r/wheezer/main/.env.example
cp .env.example .env
# edit .env, set GOOGLE_MAPS_API_KEY (optional, see below)
mkdir -p data          # see note below
docker compose up -d
```

**Build from source** (if you're modifying the code):

```bash
git clone https://github.com/amar-r/wheezer.git
cd wheezer
cp .env.example .env
mkdir -p data          # see note below
docker compose -f docker-compose.yml up -d --build
```

> **Create `data/` yourself before the first start.** The container runs as the
> non-root `node` user (uid 1000). If Docker has to create the bind-mount
> source directory, it creates it owned by root and the app can't write to it.
> Making it first means it's owned by you, and uid 1000 matches on most Linux
> hosts.

Either way, open `http://<host>:8420` from any device on your network
(phone, laptop, tablet, whatever).

Your entries live in `./data/entries.json` on the host, so they survive
container rebuilds/restarts. Back that file up like you would any other
self-hosted data directory.

## Folding into an existing self-hosted stack

If you already run a per-service directory structure for other self-hosted
apps (e.g. Radarr, Jellyfin, or anything else under Docker Compose), the
simplest path:

1. Copy this whole `wheezer/` folder alongside your other services.
2. Either run its own `docker compose up -d` from that subfolder (simplest,
   keeps it isolated), or paste the `wheezer` service block from this
   `compose.yaml` directly into your main `docker-compose.yml` so it starts/
   stops with everything else.
3. If you route your other services out through a tunnel or reverse proxy,
   don't reflexively add `wheezer` to it. There is no auth in front of these
   entries, so anything that puts port 8420 on the public internet needs an
   authenticating layer added with it. Reaching the app over a VPN into your
   own network sidesteps that, and is the access model the rest of this
   README assumes.

## Editing and exporting entries

Each entry in the History tab has an **Edit** link that loads it back into
the entry form for changes. Saving updates the existing record instead of
creating a new one (a **Cancel edit** link appears while editing, in case
you want to back out).

Two export options sit above the entry list:
- **Export all (JSON)**: all symptom entries, in one file. Best for backups
  or re-importing elsewhere.
- **Export entries (CSV)**: symptom entries only, opens cleanly in Excel,
  Sheets, or Numbers. Useful for bringing a printable log to a doctor's visit.

Both are plain GET requests (`/api/export`, `/api/export/csv`) if you want
to script backups, e.g. a cron job hitting the endpoint and saving the
response.

## AQI, weather & pollen lookup (Google Maps Platform)

Type an address into the **Address** box, pick one of the suggestions, then
press **Fetch conditions** to look up current air quality, weather, and
pollen for that point. All of it comes from Google Maps Platform, under one
API key.

1. Create/select a project at https://console.cloud.google.com/ and enable
   the **Places API (New)**, **Air Quality API**, **Weather API**, and
   **Pollen API**
   (https://console.cloud.google.com/google/maps-apis/api-list), then create
   an API key. This requires a Cloud billing account attached to the
   project. You're on pay-as-you-go, so charges apply once you exceed the
   free monthly volume on each API (see
   https://developers.google.com/maps/billing-and-pricing/pricing):
   - **Air Quality Usage**: 10,000 free/month, then $5.00 per 1,000
   - **Weather Usage**: 10,000 free/month, then $0.15 per 1,000
   - **Pollen Usage**: 5,000 free/month, then $10.00 per 1,000
   - **Places**: billed per autocomplete *session* rather than per
     keystroke. Check the pricing page above for the current rate and
     free volume.

   Every lookup happens on demand when you press the fetch button, so usage
   is tied directly to how often you log entries. Normal personal use
   should stay well within the free tier on all three.
2. Copy `.env.example` to `.env` and paste your key in:
   ```
   cp .env.example .env
   # edit .env, set GOOGLE_MAPS_API_KEY=your-actual-key
   ```
3. Restart with the same compose command you used above. Compose picks up
   `.env` automatically.

Without a key set, the fetch button errors on all three lookups, but you can
still enter everything manually.

AQI is requested via Google's `usa_epa` local index (not just their own
Universal AQI), so values use the familiar 0-500 EPA scale.

Address search sends each keystroke (debounced, and only from the third
character on) to Places Autocomplete, then resolves the address you pick
into coordinates once. Every request in one search carries the same session
token, which is what makes Google bill the search as a single session rather
than per keystroke. The chosen address and its coordinates are remembered in
the browser so a later visit can fetch without searching again; they are not
stored on entries.

The pollen fetch fills in "Pollen level" (category + dominant plant type,
e.g. "High (tree)") and "Pollen index" (Google's 0-5 Universal Pollen
Index), and appends "high pollen" onto the weather/air conditions field
when the level is High or Very High. All of these fields stay plain text/
number inputs, so you can always type over the fetched value.

## Notes

- No auth built in, deliberately. Anyone who can reach port 8420 can read
  and edit every entry, so the app expects to sit on a network you trust:
  your LAN, plus whatever VPN you already use to get back to it (WireGuard,
  Tailscale, or whatever your router supports). Publishing it to the public
  internet means putting an authenticating proxy in front of it first. This
  is health data.
- Storage is a flat JSON file, fine for personal single-user logging volume.
  If it ever needs multi-user support or heavier querying, swap `server.js`'s
  file read/write for SQLite: the API surface (`GET/POST/PUT/DELETE
  /api/entries`) wouldn't need to change.
- `GET /api/health` returns `{status:"ok"}`. Both compose files wire this up as
  a container healthcheck already; it's also there for Watchtower monitoring.
- Chart.js and the webfonts are vendored under `public/vendor/` rather than
  pulled from a CDN, so the app works fully offline and makes no third-party
  requests. It holds health data. Chart.js is MIT; the fonts are SIL Open Font
  License 1.1, with the licence text alongside them. See
  [`public/vendor/README.md`](public/vendor/README.md).
- If `data/entries.json` is ever corrupt (partial write, full disk), the server
  refuses to read *or* overwrite it and returns a 500 explaining why, rather
  than silently starting from an empty list and destroying your history. Repair
  or move the file, then restart.

## Versioning and releases

Versions are semver, and the git tag is what makes a release. A `v1.2.3`
tag publishes `1.2.3`, `1.2` and `1` to Docker Hub:

```yaml
image: mrrthr/wheezer:1.2.3   # exact build
image: mrrthr/wheezer:1.2     # patches only
image: mrrthr/wheezer:1       # anything backwards compatible
image: mrrthr/wheezer:latest  # tip of main, may be ahead of any release
```

`latest` tracks `main`, so it can run ahead of the newest tag. Pin to a
number if you want to control when you move.

Cutting a release:

1. Bump `version` in `package.json` and add the entry to
   [CHANGELOG.md](CHANGELOG.md).
2. Merge that to `main`.
3. Tag it and push the tag:
   ```
   git tag v1.2.3
   git push origin v1.2.3
   ```

CI refuses to publish a tag whose version disagrees with `package.json`,
so the two can't drift apart. `GET /api/health` reports the running
version, which is the quickest way to see what a container actually is.

The version badge at the top reads the highest semver tag on Docker Hub,
so it shows the newest release rather than whatever `latest` points at.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Pull requests are welcome; fork
the repo and open one against `main`.

## License

[MIT](LICENSE)

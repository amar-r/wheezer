# Wheezer

Self-hosted wheeze / symptom / environment tracker. Node/Express backend,
plain HTML+JS frontend, data persisted to a JSON file on a mounted volume.

Docker image: [`mrrthr/wheezer`](https://hub.docker.com/r/mrrthr/wheezer)
(`linux/amd64` + `linux/arm64`).

## AQI, weather & pollen lookup (Google Maps Platform)

The "Fetch AQI, Weather & Pollen" button looks up current air quality,
weather, and pollen by zip code. All three come from Google Maps Platform,
under one API key.

1. Create/select a project at https://console.cloud.google.com/ and enable
   the **Air Quality API**, **Weather API**, and **Pollen API**
   (https://console.cloud.google.com/google/maps-apis/api-list), then create
   an API key. This requires a Cloud billing account attached to the
   project. You're on pay-as-you-go, so charges apply once you exceed the
   free monthly volume on each API (see
   https://developers.google.com/maps/billing-and-pricing/pricing):
   - **Air Quality Usage**: 10,000 free/month, then $5.00 per 1,000
   - **Weather Usage**: 10,000 free/month, then $0.15 per 1,000
   - **Pollen Usage**: 5,000 free/month, then $10.00 per 1,000

   Every lookup happens on demand when you press the fetch button, so usage
   is tied directly to how often you log entries. Normal personal use
   should stay well within the free tier on all three.
2. Copy `.env.example` to `.env` and paste your key in:
   ```
   cp .env.example .env
   # edit .env, set GOOGLE_MAPS_API_KEY=your-actual-key
   ```
3. `docker compose up -d --build`. Compose will pick up `.env` automatically.

Without a key set, the fetch button errors on all three lookups, but you can
still enter everything manually.

AQI is requested via Google's `usa_epa` local index (not just their own
Universal AQI), so values use the familiar 0–500 EPA scale.
Zip-to-coordinates lookup uses zippopotam.us, free and keyless, unrelated
to the Google key.

The pollen fetch fills in "Pollen level" (category + dominant plant type,
e.g. "High (tree)") and "Pollen index" (Google's 0–5 Universal Pollen
Index), and appends "high pollen" onto the weather/air conditions field
when the level is High or Very High. All of these fields stay plain text/
number inputs, so you can always type over the fetched value.

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

## Quick start

Two ways to run it:

**Pull the published image** (fastest, no build step):

```bash
curl -O https://raw.githubusercontent.com/amar-r/wheezer/main/compose.yaml
curl -O https://raw.githubusercontent.com/amar-r/wheezer/main/.env.example
cp .env.example .env
# edit .env, set GOOGLE_MAPS_API_KEY (optional — see above)
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
3. If you're running Cloudflare Tunnel (or similar) for access to your other
   self-hosted services, add a route for `wheezer` (port 8420) the same way
   you did for the others. That gets you access from outside your home
   network too.

## Notes

- No auth built in: if you expose this outside your LAN (e.g. via
  Cloudflare Tunnel), put it behind Cloudflare Access or similar, since it's
  health data.
- Storage is a flat JSON file, fine for personal single-user logging volume.
  If it ever needs multi-user support or heavier querying, swap `server.js`'s
  file read/write for SQLite: the API surface (`GET/POST/DELETE
  /api/entries`) wouldn't need to change.
- `GET /api/health` returns `{status:"ok"}`. Both compose files wire this up as
  a container healthcheck already; it's also there for Watchtower monitoring.
- Chart.js and the webfonts are vendored under `public/vendor/` rather than
  pulled from a CDN, so the app works fully offline and makes no third-party
  requests — it holds health data.
- If `data/entries.json` is ever corrupt (partial write, full disk), the server
  refuses to read *or* overwrite it and returns a 500 explaining why, rather
  than silently starting from an empty list and destroying your history. Repair
  or move the file, then restart.

## License

[MIT](LICENSE)

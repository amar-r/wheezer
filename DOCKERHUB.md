# Wheezer

Self-hosted breathing/symptom tracker: log wheeze, cough, inhaler use, and
possible triggers, with automatic AQI, weather, and pollen lookups by zip
code (Google Maps Platform).

Source: https://github.com/amar-r/wheezer

## Quick start

```bash
mkdir wheezer && cd wheezer
curl -O https://raw.githubusercontent.com/amar-r/wheezer/main/compose.yaml
curl -O https://raw.githubusercontent.com/amar-r/wheezer/main/.env.example
cp .env.example .env
# edit .env, set GOOGLE_MAPS_API_KEY (optional — see below)
docker compose up -d
```

Open `http://localhost:8420`.

## Tags

- `latest`: most recent build off `main`
- `X.Y.Z`: pinned releases (semver git tags)

Images are built for `linux/amd64` and `linux/arm64`.

## Environment variables

- `GOOGLE_MAPS_API_KEY`: optional. Enables the "Fetch AQI, Weather &
  Pollen" button (Google Air Quality, Weather, and Pollen APIs, all under
  one key). Without it, symptom logging still works fine, you just fill in
  environment fields by hand. See the GitHub README for setup and pricing
  details.
- `PORT`: default `8420`.
- `DATA_DIR`: default `/app/data`. Mount a volume here for persistence
  (the `compose.yaml` above already does this via `./data:/app/data`).

## Data & privacy

No auth built in and no telemetry. Entries are stored as a flat JSON file
in the mounted data directory. Back it up like any other self-hosted app
data. If you expose this outside your LAN, put it behind an auth proxy
(e.g. Cloudflare Access), since it's health data.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { version } = require('./package.json');

const app = express();
const PORT = process.env.PORT || 8420;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'entries.json');

// Cache zip -> lat/lon lookups in memory so we don't re-geocode every poll
const geocodeCache = new Map();

// Refuse to keep growing the entry file without bound. Normal use is a handful
// of entries a day, so this is unreachable by hand — it's here so a stuck
// client or a loop on the network can't fill the disk.
const MAX_ENTRIES = Number(process.env.MAX_ENTRIES || 50000);

// Google's error bodies can carry backend detail (project number, quota state)
// and these messages get handed straight to the browser. Keep the full text in
// the server log, where it's useful, and let the caller see only the status.
async function upstreamError(label, r) {
  const body = await r.text();
  console.error(`${label} returned ${r.status}: ${body.slice(0, 500)}`);
  return new Error(`${label} is unavailable right now (HTTP ${r.status})`);
}

// Ensure data dir/files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

// Never fall back to an empty list here. Returning [] on a parse failure and
// then letting a later write persist it is a silent, unrecoverable wipe of
// every entry. Throwing instead leaves the bad file untouched on disk, so it
// stays recoverable by hand.
function readEntries() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw || '[]');
  } catch (e) {
    throw new Error(
      `${DATA_FILE} is not valid JSON (${e.message}). Refusing to read or ` +
      `overwrite it so your entries stay recoverable — repair or move the file, ` +
      `then restart.`
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${DATA_FILE} does not contain a JSON array. Refusing to overwrite it.`);
  }
  return parsed;
}

// Any read failure means we must not write: reply 500 and leave the file be.
function dataError(res, e) {
  console.error(e.message);
  res.status(500).json({ error: e.message });
}

function writeEntries(entries) {
  // atomic-ish write: write to temp file then rename
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// Current AQI for a zip code via Google's Air Quality API. Requests the
// USA EPA local index (not just Google's own Universal AQI) so numbers use
// the familiar 0-500 EPA scale.
async function fetchAirQuality(zip) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured on the server');

  const { lat, lon, placeName, state } = await geocodeZip(zip);

  const r = await fetch(`https://airquality.googleapis.com/v1/currentConditions:lookup?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: { latitude: lat, longitude: lon },
      extraComputations: ['LOCAL_AQI'],
      customLocalAqis: [{ regionCode: 'US', aqi: 'USA_EPA' }]
    })
  });
  if (!r.ok) throw await upstreamError('Google Air Quality API', r);
  const data = await r.json();
  const indexes = data.indexes || [];
  const epa = indexes.find(i => i.code === 'usa_epa') || indexes[0];
  if (!epa) throw new Error('No air quality index returned for that location');

  return {
    aqi: epa.aqi,
    category: epa.category,
    pollutant: epa.dominantPollutant,
    reportingArea: placeName,
    state,
    observedAt: data.dateTime
  };
}

// Look up lat/lon for a US zip code, no API key needed
async function geocodeZip(zip) {
  if (geocodeCache.has(zip)) return geocodeCache.get(zip);

  const r = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
  if (!r.ok) throw new Error(`Could not look up location for zip ${zip}`);
  const data = await r.json();
  const place = data.places && data.places[0];
  if (!place) throw new Error(`No location found for zip ${zip}`);

  const coords = {
    lat: Number(place.latitude),
    lon: Number(place.longitude),
    placeName: place['place name'],
    state: place['state abbreviation']
  };
  geocodeCache.set(zip, coords);
  return coords;
}

// Current weather for a zip code via Google's Weather API
async function fetchWeather(zip) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured on the server');

  const { lat, lon, placeName, state } = await geocodeZip(zip);

  const url = `https://weather.googleapis.com/v1/currentConditions:lookup?key=${apiKey}` +
    `&location.latitude=${lat}&location.longitude=${lon}&unitsSystem=IMPERIAL`;

  const r = await fetch(url);
  if (!r.ok) throw await upstreamError('Google Weather API', r);
  const data = await r.json();
  if (!data.temperature) throw new Error('Google Weather API response missing current conditions');

  return {
    tempF: data.temperature.degrees,
    humidity: data.relativeHumidity,
    windMph: data.wind && data.wind.speed ? data.wind.speed.value : null,
    precipitation: data.precipitation && data.precipitation.qpf ? data.precipitation.qpf.quantity : 0,
    condition: (data.weatherCondition && data.weatherCondition.description && data.weatherCondition.description.text) || 'Unknown',
    conditionCode: data.weatherCondition ? data.weatherCondition.type : null,
    observedAt: data.currentTime,
    placeName,
    state
  };
}

// Current pollen levels for a zip code via Google's Pollen API, which has
// real US coverage across grass, tree, and weed.
async function fetchPollen(zip) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_MAPS_API_KEY is not configured on the server');

  const { lat, lon, placeName, state } = await geocodeZip(zip);

  const url = `https://pollen.googleapis.com/v1/forecast:lookup?key=${apiKey}` +
    `&location.latitude=${lat}&location.longitude=${lon}&days=1`;

  const r = await fetch(url);
  if (!r.ok) throw await upstreamError('Google Pollen API', r);
  const data = await r.json();
  const today = data.dailyInfo && data.dailyInfo[0];
  if (!today || !today.pollenTypeInfo) {
    throw new Error('No pollen forecast available for that location');
  }

  const byType = {};
  for (const t of today.pollenTypeInfo) {
    byType[t.code] = {
      value: t.indexInfo ? t.indexInfo.value : null,
      category: t.indexInfo ? t.indexInfo.category : null,
      inSeason: t.inSeason
    };
  }

  // Google returns an entry per plant type even when there's no active
  // index for it right now (common off-season) — only pick a dominant type
  // from ones that actually have a numeric value, so we never end up
  // reporting a null "dominant" reading.
  const typesWithData = Object.keys(byType).filter(t => byType[t].value !== null && byType[t].value !== undefined);
  if (typesWithData.length === 0) {
    throw new Error('No active pollen index for grass, tree, or weed at this location right now');
  }
  const dominantType = typesWithData.reduce((a, b) => (byType[b].value > byType[a].value ? b : a));

  return {
    grass: byType.GRASS || null,
    tree: byType.TREE || null,
    weed: byType.WEED || null,
    dominantType: dominantType.toLowerCase(),
    dominantValue: byType[dominantType].value,
    dominantCategory: byType[dominantType].category,
    placeName,
    state
  };
}

// An entry is a couple dozen short fields, so 32kb is generous for one and well
// under Express's 100kb default — a client can't push large payloads at us.
app.use(express.json({ limit: '32kb' }));

// Scripts, styles and fonts are all vendored under public/vendor and served from
// this origin, so a same-origin policy costs nothing here. 'unsafe-inline' is
// unavoidable while the page keeps its <script>/<style> blocks inline, which
// blunts the anti-XSS value — but connect-src still stops injected code from
// shipping entries off to another host, and frame-ancestors blocks clickjacking.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'"
].join('; ');

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Entries created before the switch to UUIDs have numeric ids, and ids arrive
// from the URL as strings, so always compare stringified.
const sameId = (a, b) => String(a) === String(b);

// GET all entries
app.get('/api/entries', (req, res) => {
  try {
    res.json(readEntries());
  } catch (e) {
    dataError(res, e);
  }
});

// POST a new entry
app.post('/api/entries', (req, res) => {
  try {
    const entries = readEntries();
    if (entries.length >= MAX_ENTRIES) {
      return res.status(507).json({
        error: `Entry limit reached (${MAX_ENTRIES}). Delete old entries or raise MAX_ENTRIES.`
      });
    }
    // id last: the body must never be able to choose its own id, or a client
    // can collide with (and later delete) an existing entry.
    const entry = { ...req.body, id: randomUUID() };
    entries.unshift(entry);
    writeEntries(entries);
    res.status(201).json(entry);
  } catch (e) {
    dataError(res, e);
  }
});

// PUT (update) an existing entry by id
app.put('/api/entries/:id', (req, res) => {
  try {
    const entries = readEntries();
    const idx = entries.findIndex(e => sameId(e.id, req.params.id));
    if (idx === -1) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    entries[idx] = { ...entries[idx], ...req.body, id: entries[idx].id };
    writeEntries(entries);
    res.json(entries[idx]);
  } catch (e) {
    dataError(res, e);
  }
});

// DELETE an entry by id
app.delete('/api/entries/:id', (req, res) => {
  try {
    const entries = readEntries();
    const remaining = entries.filter(e => !sameId(e.id, req.params.id));
    if (remaining.length === entries.length) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    writeEntries(remaining);
    res.status(204).end();
  } catch (e) {
    dataError(res, e);
  }
});

// Simple health check for docker-compose healthchecks. Reports the version so
// you can tell which build a running container actually is.
app.get('/api/health', (req, res) => res.json({ status: 'ok', version }));

// The three lookup endpoints below each spend real money against the Google
// Maps Platform quota, and anything on the network can reach them unauthenticated.
// A fixed window per client IP keeps a runaway script or a compromised device
// from looping on them. The hard ceiling on spend is the quota configured in the
// Google Cloud console — this is only the local backstop.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.LOOKUP_RATE_LIMIT || 30);
const rateBuckets = new Map();

function rateLimitLookups(req, res, next) {
  const now = Date.now();
  let bucket = rateBuckets.get(req.ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateBuckets.set(req.ip, bucket);
  }
  bucket.count++;
  if (bucket.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: `Too many lookups — try again in ${retryAfter}s.` });
  }
  next();
}

// Buckets are keyed by IP, so left alone this map grows for the life of the
// process — the same unbounded-growth problem it exists to prevent. unref() so
// a pending sweep never holds the process open on shutdown.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

// Look up current AQI by zip code (server-side, keeps API key private)
app.get('/api/aqi', rateLimitLookups, async (req, res) => {
  const zip = (req.query.zip || '').trim();

  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Provide a 5-digit zip code, e.g. ?zip=10001' });
  }
  try {
    const result = await fetchAirQuality(zip);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Look up current weather by zip code (server-side, keeps API key private)
app.get('/api/weather', rateLimitLookups, async (req, res) => {
  const zip = (req.query.zip || '').trim();
  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Provide a 5-digit zip code, e.g. ?zip=10001' });
  }
  try {
    const result = await fetchWeather(zip);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Look up current pollen levels by zip code (server-side, keeps API key private)
app.get('/api/pollen', rateLimitLookups, async (req, res) => {
  const zip = (req.query.zip || '').trim();
  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Provide a 5-digit zip code, e.g. ?zip=10001' });
  }
  try {
    const result = await fetchPollen(zip);
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Full export: all symptom entries, as one JSON file
app.get('/api/export', (req, res) => {
  let entries;
  try {
    entries = readEntries();
  } catch (e) {
    return dataError(res, e);
  }
  const payload = { exportedAt: new Date().toISOString(), entries };
  const filename = `wheezer-export-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload, null, 2));
});

// CSV export of symptom entries only, for spreadsheets or sharing with a doctor
app.get('/api/export/csv', (req, res) => {
  let entries;
  try {
    entries = readEntries();
  } catch (e) {
    return dataError(res, e);
  }
  const columns = [
    'date', 'time', 'wheeze', 'wheezeSeverity', 'cough', 'coughSeverity', 'chest', 'chestSeverity',
    'shortness', 'shortnessSeverity', 'phlegm',
    'scheduled', 'rescuePuffs', 'aqi', 'aqiPeak', 'pollenLevel', 'pollenIndex', 'tempF', 'humidity',
    'weather', 'setting', 'breakfast', 'lunch', 'dinner', 'snacks', 'notes'
  ];

  function csvEscape(val) {
    if (val === undefined || val === null) return '';
    let s = String(val);
    // Excel/Sheets treat a leading =, +, - or @ as a formula, so a notes field
    // like "=HYPERLINK(...)" would execute on open. Prefix with an apostrophe
    // to force it back to plain text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  const rows = [columns.join(',')];
  for (const e of entries) {
    rows.push(columns.map(col => csvEscape(e[col])).join(','));
  }
  const csv = rows.join('\n');

  const filename = `wheezer-entries-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'text/csv');
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`Wheezer listening on port ${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});

# Contributing

Thanks for looking. Wheezer is a small single-user app and the aim is to
keep it that way: one Node process, a JSON file, no build step, no
account system. Changes that hold that line are easy to merge.

## Before you write code

Open an issue first for anything bigger than a bug fix or a typo. It's
cheaper than finding out after the fact that a feature doesn't fit.

Bug reports are more useful with the entry that triggered it, but scrub
it first. The `data/entries.json` file is health data and issues here are
public.

## Running it locally

Without Docker:

```
npm install
npm start
```

That serves on port 8420 and writes to `./data/entries.json`.

With Docker, building from source:

```
cp .env.example .env
mkdir -p data
docker compose -f docker-compose.yml up -d --build
```

The Google API key is optional. Without it the fetch button errors on all
three lookups and you type the values in by hand, which is fine for most
development.

## What CI checks

Every pull request runs a syntax check on `server.js`, builds the image,
starts the container, and polls `/api/health` until it answers. Nothing
runs a test suite, because there isn't one yet. If you add tests, wire
them into `.github/workflows/docker-publish.yml` in the same job.

Pull requests from forks run all of that but can't reach the Docker Hub
credentials, so they never publish an image.

## Things to keep in mind

The frontend is one HTML file with inline CSS and JS. That's deliberate.
It loads fast, it's easy to read end to end, and there's nothing to
compile. Please don't add a bundler or a framework.

Chart.js and the webfonts live in `public/vendor/` instead of coming from
a CDN, so the app works with no internet and makes no requests to anyone
else. If you add a dependency the browser loads, vendor it the same way
and bring its licence along. See
[`public/vendor/README.md`](public/vendor/README.md).

Anything user-entered that gets rendered back into the page has to go
through `escapeHtml()`. Anything written to `data/entries.json` goes
through the temp file and rename in `writeEntries()`, so a crash halfway
can't truncate the real file.

There's no auth, on purpose. The app expects to sit on a trusted network
and be reached over a VPN from outside it. If you need more than that,
put an authenticating proxy in front rather than adding a login screen
here.

## How changes get merged

Every path is covered by [CODEOWNERS](.github/CODEOWNERS), so pull
requests need a review before they merge. Images publish only from `main`
or a `v*.*.*` tag, and the publish step waits on manual approval.

## Labels

Issues and pull requests use the labels defined in
[`.github/labels.json`](.github/labels.json). A workflow syncs them, so
edit that file rather than changing labels by hand in the GitHub UI.

## Security

For anything exploitable, email rather than opening a public issue.
Contact details are on the GitHub profile linked from the repo.

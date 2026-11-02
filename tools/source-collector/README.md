# Source Collector

A reusable local collector for public RSS/Atom articles, selected HTTP pages and linked files. It uses Crawlee queues, deterministic XML/HTML extraction, Markdown conversion and optional Playwright rendering. No LLM, cloud account or API key is required. Project-specific sources, credentials, collected articles and downloads are not bundled.

## Run

Requires Node.js 22.12 or newer. From this folder:

```powershell
npm ci --ignore-scripts
node src/cli.mjs collect --config profiles/example.json --output ../../work/source-collector/example
node src/cli.mjs search --output ../../work/source-collector/example --query "Python"
node src/cli.mjs export --output ../../work/source-collector/example --destination ../../work/source-collector/new-reference-collection
```

The example captures one public Python tutorial page. Copy it to a new profile and configure the sources for the selected project. To reuse the tool elsewhere, copy this complete folder excluding node_modules and runtime storage, then install from the included lockfile. Keep each profile's runtime output separate and ignored by Git.

## Profiles and coverage

`allowedHosts` and `allowedPaths` are mandatory allowlists. Supply `feeds`, `pageUrls`, or both. A paginated feed needs `url`, `pageUrl` containing `{page}`, `pageSize`, and `maxPages`; a short/empty page establishes its end. Repeated pages and page-limit exhaustion leave the run incomplete. `minExpectedArticles` can guard a known inventory. Optional `baselineFile` paths resolve relative to the profile and read a `known_article_urls` array; initial fingerprints of known URLs are not new-release announcements.

Set `contentSelector`, `titleSelector` and `downloadSelector` from inspected HTML. Keep comments, navigation and unrelated footer references outside the selected content/download controls. `enrichFeedPages` accepts `never`, `all`, or `new-or-updated`. `downloadExtensions` selects candidate files, not proof that they are safe or native application assets.

Defaults: 750 ms between HTTP request starts, at most two network requests, 30 s per request, 8 MiB per page, 50 MiB per file, 30 attempted files and 200 MiB downloaded file bytes per invocation. File-enabled runs serialize queued work to enforce aggregate budgets. Adjust limits explicitly in the profile.

## Resume and evidence

```powershell
node src/cli.mjs collect --config profiles/example.json --output ../../work/source-collector/example --resume RUN_ID
```

Use the ID printed by the original run and its original profile plus feeds-only/limit options. Resume reuses completed feed pages and verified tasks, retrying failed/deferred work or missing objects. Start without `--resume` for a fresh observation. Older immutable objects and run manifests preserve revisions. The output lock refuses another live writer and permits recovery only after its owner is confirmed dead.

`--feeds-only` requests feed text only. `--limit N` deliberately produces an incomplete capture. `--stop-after N` checkpoints a bounded number of tasks for controlled resume exercises. SIGINT requests a graceful stop between items. Capped or unfinished work never advances the successful-run pointer. Robots and scope exclusions are visible terminal exclusions, not successful downloads.

Exit codes: 0 means complete within the reported profile/scope, 2 means incomplete capture, and 1 means configuration/process error. Read the manifest even after an abnormal exit. Feed bodies can be excerpts or omit website controls: inspect `bodyKind` and task outcomes before describing coverage.

- `objects/`: immutable raw feed/HTML, normalized Markdown and file bytes addressed by SHA-256.
- `state.json`: latest records and hashes per URL/acquisition method.
- `runs/<id>/run.json` and `report.md`: item checkpoints, source dates, changes, coverage, exclusions and errors.
- `latest.json`: the newest manifest/report pointers.
- `queues/`: Crawlee queue evidence per processing attempt; the manifest is authoritative for resumption.

Search and export select the latest captured variant per URL; page capture wins a timestamp tie. Export requires a new lowercase collection-slug folder and produces `collection.json`, `source/documents.json` and one hash-verified Markdown reference per URL. It retains capture/acquisition metadata and author/publication fields where available. This format supports a separate document-to-skill or knowledge-ingestion workflow; extraction is not synthesis.

## Explicit browser mode

Set `pageMode` to `browser`, optionally set `waitForSelector`, and set `browserChannel` to `msedge` or `chrome` for an installed browser. Without a channel, install pinned Playwright Chromium with `npx playwright install chromium` through the host's normal permission mechanism. Rendering uses an isolated headless context, not personal tabs or credentials. Only configured GET resources within host/path and robots scope are fulfilled with the same request limits. Blocked third-party resources can leave some sites incomplete. There is no automatic browser escalation after an HTTP denial.

## Boundaries and checks

The network layer checks scope, robots, redirects and the DNS lookup used by the socket. Private networks are disabled by default; `allowPrivateNetworks` is for explicitly authorized internal sources and local fixtures. Credential URLs, signed-query links, cookies, authorization headers and proxies are unsupported. Access denials remain recorded; no stealth, CAPTCHA or protected-endpoint bypass is provided.

Files are bounded and hashed. ZIP-family containers are inspected for unsafe paths, symlinks and expansion limits without extraction; misleading HTML downloads are rejected. Metadata inspection does not validate CRCs, source behavior, licensing, native compatibility or calculations. The collector never installs packages, runs collected code or publishes to another service. Keep raw captures local until reviewed for the intended publication destination.

Run `npm test` for real local HTTP integration fixtures. Set `$env:COLLECTOR_TEST_BROWSER_CHANNEL='msedge'` before the command to include actual JavaScript rendering; otherwise that check is explicitly skipped. Eight tests cover revisions/deduplication, export, checkpoint/resume, missing-object repair, transient recovery, budgets, scope/redirect/robots enforcement, size limits, invalid downloads, unsafe ZIP metadata, XML/Atom and writer locks. Restricted hosts may require permission for localhost requests and browser launch.

Dependencies are pinned. The documented minimatch 11.0.1 override addresses GHSA-g3hv-75wg-m249 in Crawlee's older transitive requirement; re-test the lock when upgrading. Collected third-party content retains its ownership. No blanket redistribution license is assigned to source material.

Upstream resources: [Crawlee](https://github.com/apify/crawlee), [Playwright](https://github.com/microsoft/playwright), [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser), [Cheerio](https://github.com/cheeriojs/cheerio), [Turndown](https://github.com/mixmark-io/turndown), [robots-parser](https://github.com/samclarke/robots-parser) and [yauzl](https://github.com/thejoshwolfe/yauzl).

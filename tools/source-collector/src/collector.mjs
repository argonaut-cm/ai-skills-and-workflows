import fs from 'node:fs/promises';
import path from 'node:path';
import { BasicCrawler } from '@crawlee/basic';
import { Configuration, RequestQueue, log } from '@crawlee/core';
import { Network, canonical, CaptureError } from './network.mjs';
import { feedItems, extractHtml, inspectDownload } from './extract.mjs';
import { atomicJson, readJson, object, sha, now, lock } from './store.mjs';

export async function loadProfile(file) {
  const input = await readJson(file);
  const c = { schemaVersion: 1, intervalMs: 750, concurrency: 2, timeoutMs: 30000,
    maxPageBytes: 8 * 1024 ** 2, maxFileBytes: 50 * 1024 ** 2, maxFiles: 30,
    maxTotalFileBytes: 200 * 1024 ** 2, maxArticles: 1000, minExpectedArticles: 0,
    userAgent: 'SourceCollector/0.1 (personal research reference)', allowPrivateNetworks: false,
    allowedPaths: ['/'], feeds: [], pageUrls: [], enrichFeedPages: 'new-or-updated',
    pageMode: 'http', contentSelector: 'article', titleSelector: 'h1',
    downloadSelector: 'a[href]', downloads: true,
    downloadExtensions: ['.zip','.sxp','.sqx','.sqb','.java','.xml','.ipb','.pdf','.json','.txt'], ...input };
  if (c.schemaVersion !== 1 || !/^[a-z0-9][a-z0-9-]*$/.test(c.name || '')) throw Error('Profile needs schemaVersion 1 and a lowercase slug name');
  if (!Array.isArray(c.allowedHosts) || !c.allowedHosts.length) throw Error('Explicit allowedHosts are required');
  if (!Array.isArray(c.allowedPaths) || !c.allowedPaths.length || c.allowedPaths.some(p => !p.startsWith('/'))) throw Error('Invalid allowedPaths');
  for (const key of ['intervalMs','concurrency','timeoutMs','maxPageBytes','maxFileBytes','maxFiles','maxTotalFileBytes','maxArticles'])
    if (!Number.isFinite(c[key]) || c[key] < (key === 'intervalMs' ? 0 : 1)) throw Error(`Invalid limit: ${key}`);
  if (!['http','browser'].includes(c.pageMode) || !['never','all','new-or-updated'].includes(c.enrichFeedPages)) throw Error('Invalid capture mode');
  if (c.headers || c.cookies || c.proxy || c.apiKey) throw Error('Credential/header/proxy configuration is not supported');
  c.knownUrls = c.knownUrls || [];
  if (c.baselineFile) c.knownUrls = [...c.knownUrls, ...(await readJson(path.resolve(path.dirname(file),c.baselineFile))).known_article_urls];
  c.feeds.forEach(f => {
    canonical(f.url);
    if (f.pageUrl && (!f.pageUrl.includes('{page}') || !Number.isInteger(f.pageSize) || f.pageSize < 1 || !Number.isInteger(f.maxPages) || f.maxPages < 1)) throw Error('Paged feeds need pageUrl, positive pageSize and maxPages');
  });
  c.pageUrls.forEach(u => canonical(u));
  if (!c.feeds.length && !c.pageUrls.length) throw Error('At least one feed or page source is required');
  for (const value of [...c.pageUrls,...c.feeds.map(f => f.url)]) {
    const u = new URL(canonical(value));
    if (!c.allowedHosts.includes(u.hostname.replace(/^\[|\]$/g,'')) || !c.allowedPaths.some(p => u.pathname.startsWith(p)))
      throw Error('A configured source is outside the profile host/path scope');
  }
  return c;
}

export async function collect(config, root, options = {}) {
  root = path.resolve(root);
  const release = await lock(root);
  const profileHash = sha(JSON.stringify(config));
  const id = options.resume || now().replace(/[:.]/g,'-');
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) { await release(); throw Error('Invalid run ID'); }
  const runFile = path.join(root, 'runs', id, 'run.json');
  let saveTail = Promise.resolve();
  try {
    const state = await readJson(path.join(root,'state.json'), { schemaVersion: 1, documents: {}, downloads: {}, lastCompleteRun: null });
    if (state.name && state.name !== config.name) throw Error('Output belongs to another profile; use a separate output folder');
    state.name = config.name;
    const previousDocuments = structuredClone(state.documents);
    const run = options.resume ? await readJson(runFile) : {
      id, name: config.name, profileHash, started: now(), complete: false, feeds: {},
      hadPriorAtStart: Object.keys(previousDocuments).length > 0,
      tasks: {}, documents: {}, downloads: {}, warnings: [], errors: [], inventory: [],
      options: { feedsOnly: !!options.feedsOnly, limit: options.limit || null } };
    if (run.profileHash !== profileHash) throw Error('Resume requires the same profile; start a new run after profile changes');
    if (run.options.feedsOnly !== !!options.feedsOnly || run.options.limit !== (options.limit || null)) throw Error('Resume requires the original feeds-only/limit options');
    const net = new Network(config);
    const save = () => {
      saveTail = saveTail.then(async () => { await atomicJson(path.join(root,'state.json'), state); await atomicJson(runFile,run); });
      return saveTail;
    };
    const known = new Set(config.knownUrls.map(u => canonical(u)));
    const hadPrior = run.hadPriorAtStart;
    let fileCount = 0, fileBytes = 0, stopped = false;
    const onInterrupt = () => { stopped = true; };
    process.once('SIGINT', onInterrupt);
    const storeDocument = async (url, metadata, html, acquisition) => {
      const extracted = extractHtml(html, url, config, acquisition.startsWith('feed'));
      const raw = await object(root, html, 'html');
      const body = await object(root, extracted.markdown, 'md');
      const key = `${url}::${acquisition}`, previous = previousDocuments[key];
      if (options.resume && run.documents[key]?.body.sha256 === body.sha256) return run.documents[key];
      const change = previous ? (previous.body.sha256 === body.sha256 ? 'unchanged' : 'updated')
        : (known.has(url) ? 'initial-fingerprint' : hadPrior || known.size ? 'newly-discovered' : 'initial-fingerprint');
      const record = { url, title: extracted.title || metadata.title || url, ...metadata,
        acquisition, normalization: 'cheerio-turndown-v1', capturedAt: now(), raw, body, change,
        attachmentUrls: [...new Set([...(metadata.enclosures || []), ...extracted.links])],
        previousSha256: previous?.body.sha256 || null };
      state.documents[key] = record;
      run.documents[key] = record;
      return record;
    };
    const task = (kind, url, data = {}) => {
      url = canonical(url);
      const key = sha(kind + ':' + url);
      if (!run.tasks[key]) run.tasks[key] = { kind, url, ...data, status: 'pending', attempts: 0 };
    };
    const attachmentTasks = rec => {
      for (const url of rec.attachmentUrls) {
        try { task('download',url,{ articleUrl: rec.url }); }
        catch (e) { run.warnings.push(`Excluded attachment URL: ${e.status || 'invalid'}`); }
      }
    };
    await save();
    // Feed checkpoints are raw immutable objects, allowing a resumed run to
    // reconstruct inventory without re-requesting completed feed pages.
    for (const feed of config.feeds) {
      const feedKey = sha(feed.url);
      const progress = run.feeds[feedKey] ||= { url: feed.url, pages: {}, complete: false, seen: [] };
      try {
        const seen = new Set();
        for (let page = 1; page <= (feed.maxPages || 1); page++) {
          if (stopped) break;
          const pageUrl = feed.pageUrl ? feed.pageUrl.replace('{page}',page) : feed.url;
          let pageRecord = progress.pages[page];
          if (!pageRecord || !Number.isInteger(pageRecord.itemCount)) {
            const response = await net.get(pageUrl);
            const raw = await object(root,response.bytes,'xml');
            pageRecord = progress.pages[page] = { url: pageUrl, finalUrl: response.finalUrl, raw, capturedAt: now() };
            await save();
          }
          const raw = await fs.readFile(path.join(root,pageRecord.raw.path));
          if (sha(raw) !== pageRecord.raw.sha256) throw Error('Feed checkpoint hash mismatch');
          const items = feedItems(raw);
          let fresh = 0;
          for (const item of items) {
            const url = canonical(item.url,feed.url);
            await net.check(url);
            if (seen.has(url)) continue;
            seen.add(url); fresh++;
            if (!run.inventory.includes(url)) run.inventory.push(url);
            if (run.inventory.length > config.maxArticles || (options.limit && run.inventory.length > options.limit)) {
              run.warnings.push('Article limit reached; this is a capped capture');
              progress.capped = true; break;
            }
            const rec = await storeDocument(url,{ title: item.title, author: item.author,
              published: item.published, bodyKind: item.bodyKind, feedUrl: pageUrl, enclosures: item.enclosures },item.html,'feed-v1');
            if (!options.feedsOnly) {
              if (config.enrichFeedPages === 'all' || (config.enrichFeedPages === 'new-or-updated' && ['newly-discovered','updated'].includes(rec.change))) task('page',url);
              if (config.downloads) attachmentTasks(rec);
            }
          }
          pageRecord.itemCount = items.length;
          progress.seen = [...seen];
          if (progress.capped) break;
          if (!feed.pageUrl || items.length < feed.pageSize) { progress.complete = true; break; }
          if (!fresh) throw Error('Feed pagination repeated an earlier page without reaching its end');
          await save();
        }
        if (!progress.complete && !progress.capped && !stopped) throw Error('Feed page limit reached without an end marker');
        delete progress.error;
      } catch (e) { progress.error = e.message; progress.complete = false; }
      await save();
    }
    if (!options.feedsOnly) for (const url of config.pageUrls) task('page',url);
    const validObject = async ref => {
      if (!ref) return false;
      try { return sha(await fs.readFile(path.join(root,ref.path))) === ref.sha256; } catch { return false; }
    };
    for (const t of Object.values(run.tasks)) {
      if (t.status === 'downloaded' && !await validObject(run.downloads[t.url])) {
        t.status = 'pending';delete run.downloads[t.url];
      }
      if (t.status === 'captured') {
        const rec = run.documents[`${t.url}::page-${config.pageMode}-v1`];
        if (!await validObject(rec?.body) || !await validObject(rec?.raw)) t.status = 'pending';
      }
    }
    await save();
    const pending = Object.entries(run.tasks).filter(([,t]) => !['captured','downloaded','blocked-robots','excluded-scope'].includes(t.status));
    const attempt = Date.now().toString(36);
    const cc = new Configuration({ persistStorage: true, purgeOnStart: false, logLevel: 'ERROR',
      storageClientOptions: { localDataDirectory: path.join(root,'queues',id,attempt) } });
    log.setLevel(log.LEVELS.ERROR);
    const queue = await RequestQueue.open('tasks',{ config: cc });
    for (const [key,t] of pending) await queue.addRequest({ url: t.url, uniqueKey: key, userData: { key } });
    let processed = 0;
    // Serialize file-enabled runs so aggregate byte/attempt budgets cannot be
    // exceeded by two concurrent responses reserving the same remaining limit.
    const crawler = new BasicCrawler({ requestQueue: queue, maxConcurrency: config.downloads ? 1 : config.concurrency,
      maxRequestRetries: 0, useSessionPool: false, requestHandlerTimeoutSecs: Math.max(120,config.timeoutMs / 1000 * 5),
      requestHandler: async ({ request }) => {
        const key = request.userData.key, t = run.tasks[key];
        if (stopped || (options.stopAfter && processed >= options.stopAfter)) { t.status = 'deferred'; return; }
        if (t.kind === 'download' && (fileCount >= config.maxFiles || fileBytes >= config.maxTotalFileBytes)) { t.status = 'deferred-budget'; return; }
        t.attempts++; t.started = now();
        try {
          if (t.kind === 'page') {
            const response = config.pageMode === 'browser' ? await net.render(t.url,config.waitForSelector) : await net.get(t.url);
            if (!/html/i.test(response.contentType)) throw new CaptureError('Expected HTML article response');
            const feedRecord = state.documents[`${t.url}::feed-v1`];
            const rec = await storeDocument(t.url,{ finalUrl: response.finalUrl,
              ...(feedRecord ? {author:feedRecord.author,published:feedRecord.published,feedUrl:feedRecord.feedUrl} : {}),
              bodyKind:'selected-page-content' },response.bytes.toString('utf8'),`page-${config.pageMode}-v1`);
            if (config.downloads) {
              attachmentTasks(rec);
              for (const [childKey,child] of Object.entries(run.tasks))
                if (child.kind === 'download' && child.status === 'pending') await queue.addRequest({ url: child.url, uniqueKey: childKey, userData: { key: childKey } });
            }
            t.status = 'captured';
          } else {
            // A new run refreshes file bytes even at stable URLs. A resumed run
            // skips only items already verified in this exact run.
            fileCount++;
            const response = await net.get(t.url,{ maxBytes: Math.min(config.maxFileBytes,config.maxTotalFileBytes-fileBytes) });
            fileBytes += response.bytes.length;
            const inspection = await inspectDownload(response.bytes,t.url,response.contentType);
            const ext = path.posix.extname(new URL(t.url).pathname).toLowerCase().slice(1) || 'bin';
            const stored = await object(root,response.bytes,ext);
            const prev = state.downloads[t.url];
            const record = { url: t.url, finalUrl: response.finalUrl, articleUrl: t.articleUrl,
              capturedAt: now(), contentType: response.contentType, ...stored, inspection,
              change: prev ? prev.sha256 === stored.sha256 ? 'unchanged' : 'updated' : 'first-download',
              previousSha256: prev?.sha256 || null };
            state.downloads[t.url] = record; run.downloads[t.url] = record;
            t.status = 'downloaded';
          }
          delete t.error;
        } catch (e) { t.status = e.status || 'failed'; t.error = e.message; }
        t.finished = now(); processed++; await save();
      }, failedRequestHandler: async ({ request }, error) => {
        const t = run.tasks[request.userData.key]; t.status = 'failed'; t.error = error.message; await save();
      } },cc);
    try { if (pending.length && !stopped) await crawler.run(); }
    finally { process.removeListener('SIGINT',onInterrupt); }
    run.finished = now();
    run.inventoryComplete = !stopped && Object.values(run.feeds).every(f => f.complete && !f.error && !f.capped)
      && (!config.feeds.length || run.inventory.length >= config.minExpectedArticles);
    if (options.limit) run.inventoryComplete = false;
    const incomplete = Object.values(run.tasks).filter(t => !['captured','downloaded','blocked-robots','excluded-scope'].includes(t.status));
    run.complete = run.inventoryComplete && incomplete.length === 0 && !stopped;
    run.scope = options.feedsOnly ? 'feed article text only; page enrichment and downloads not requested' : 'configured feeds, selected pages and permitted file links';
    run.counts = { articles: new Set(Object.values(run.documents).map(d => d.url)).size,
      feedArticles: run.inventory.length, documents: Object.keys(run.documents).length,
      tasks: Object.keys(run.tasks).length, downloads: Object.keys(run.downloads).length,
      blockedByRobots: Object.values(run.tasks).filter(t => t.status === 'blocked-robots').length,
      excludedByScope: Object.values(run.tasks).filter(t => t.status === 'excluded-scope').length,
      incomplete: incomplete.length };
    if (run.complete) state.lastCompleteRun = id;
    await save();
    const summary = [`# ${config.name}: source capture`, '', `Run: ${id}`, `Scope: ${run.scope}`, '',
      `Complete within configured scope: **${run.complete}**`, `Feed inventory complete: **${run.inventoryComplete}**`, '',
      ...Object.entries(run.counts).map(([k,v]) => `- ${k}: ${v}`), '',
      '## Feed coverage', '', ...Object.values(run.feeds).map(f => `- ${f.url}: ${f.seen.length} unique articles, ${Object.keys(f.pages).length} pages; complete=${f.complete}${f.error ? '; '+f.error : ''}`), '',
      '## Pending or excluded tasks', '', ...Object.values(run.tasks).filter(t => !['captured','downloaded'].includes(t.status)).map(t => `- ${t.status}: ${t.url}${t.error ? ' — '+t.error : ''}`), '',
      '## Changes', '', ...Object.values(run.documents).filter(d => d.change !== 'unchanged').map(d => `- ${d.change}: [${d.title.replace(/[\[\]]/g,'')}](${d.url}) (${d.acquisition})`), '',
      '## Limits', '', 'Feed bodies can be excerpts or omit download controls. Initial fingerprints are not release announcements. ZIP checks inspect metadata only; downloaded source has not been executed, installed or functionally verified.',
      ...run.warnings.map(w => `- ${w}`), ''];
    await fs.writeFile(path.join(root,'runs',id,'report.md'),summary.join('\n'));
    await atomicJson(path.join(root,'latest.json'),{ id, complete: run.complete, run: `runs/${id}/run.json`, report: `runs/${id}/report.md` });
    return { run, root, runFile };
  } finally { await saveTail; await release(); }
}

export function preferredReferences(documents) {
  const chosen = new Map();
  for (const rec of Object.values(documents)) {
    const old = chosen.get(rec.url);
    if (!old || rec.capturedAt > old.capturedAt
      || (rec.capturedAt === old.capturedAt && rec.acquisition.startsWith('page-'))) chosen.set(rec.url,rec);
  }
  return [...chosen.values()];
}

export async function exportReferences(root, destination) {
  const state = await readJson(path.join(root,'state.json'));
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path.basename(destination))) throw Error('Export destination basename must be a lowercase collection slug');
  await fs.mkdir(destination); // Never overwrite a reviewed export.
  const documents = [];
  await fs.mkdir(path.join(destination,'source'));
  for (const rec of preferredReferences(state.documents)) {
    const bytes = await fs.readFile(path.join(root,rec.body.path));
    if (sha(bytes) !== rec.body.sha256) throw Error('Reference hash mismatch');
    const name = sha(rec.url).slice(0,16)+'.md';
    await fs.writeFile(path.join(destination,'source',name),bytes);
    documents.push({ title: rec.title, url: rec.url, path: `source/${name}`, sha256: rec.body.sha256,
      capturedAt: rec.capturedAt, acquisition: rec.acquisition, published: rec.published || null,
      author: rec.author || null, bodyKind: rec.bodyKind, normalization: rec.normalization });
  }
  await atomicJson(path.join(destination,'source','documents.json'),{ schema_version: 1, documents });
  await atomicJson(path.join(destination,'collection.json'),{ schema_version: 1, collection_id: path.basename(destination), title: 'Collected source references', source_url: '' });
  return documents.length;
}

export async function search(root, query, limit = 8) {
  const state = await readJson(path.join(root,'state.json'));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean), found = [];
  for (const rec of preferredReferences(state.documents)) {
    const bytes = await fs.readFile(path.join(root,rec.body.path));
    if (sha(bytes) !== rec.body.sha256) throw Error('Search source hash mismatch');
    const body = bytes.toString('utf8');
    if (!words.every(w => (rec.title+' '+body).toLowerCase().includes(w))) continue;
    found.push({ ...rec, score: words.reduce((n,w) => n+(rec.title.toLowerCase().includes(w)?20:1),0) });
  }
  return found.sort((a,b) => b.score-a.score).slice(0,limit).map(d => ({ title: d.title, url: d.url, acquisition: d.acquisition, reference: path.resolve(root,d.body.path) }));
}

import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import robotsParser from 'robots-parser';

export class CaptureError extends Error {
  constructor(message, status = 'failed') { super(message); this.status = status; }
}

export function canonical(value, base) {
  const u = new URL(value, base);
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password)
    throw new CaptureError('Only public HTTP(S) URLs without credentials are supported', 'blocked');
  if ([...u.searchParams.keys()].some(k => /token|secret|password|api.?key|signature|authorization/i.test(k)))
    throw new CaptureError('Credential or signed-query URL excluded', 'blocked');
  u.hash = '';
  return u.href;
}

export function isPrivate(ip) {
  ip = ip.replace(/^::ffff:/i, '');
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b));
  }
  return !net.isIPv6(ip) || ip === '::' || ip === '::1' || /^(fc|fd|fe[89ab])/i.test(ip);
}

export class Network {
  constructor(config) {
    this.config = config;
    this.robots = new Map();
    this.gate = Promise.resolve();
    this.lastStart = 0;
    this.active = 0;
    this.waiters = [];
  }
  async check(value, robots = false) {
    const url = canonical(value), u = new URL(url);
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (!this.config.allowedHosts.includes(host)) throw new CaptureError(`Host outside scope: ${host}`, 'excluded-scope');
    if (!robots && !this.config.allowedPaths.some(p => u.pathname.startsWith(p)))
      throw new CaptureError(`Path outside scope: ${u.pathname}`, 'excluded-scope');
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses.length || (!this.config.allowPrivateNetworks && addresses.some(a => isPrivate(a.address))))
      throw new CaptureError('Private or non-public network destination excluded', 'blocked');
    return url;
  }
  async pace() {
    const previous = this.gate;
    let release;
    this.gate = new Promise(r => { release = r; });
    await previous;
    try {
      const wait = Math.max(0, this.lastStart + this.config.intervalMs - Date.now());
      if (wait) await new Promise(r => setTimeout(r, wait));
      this.lastStart = Date.now();
    } finally { release(); }
  }
  async policy(url) {
    const origin = new URL(url).origin;
    if (!this.robots.has(origin)) {
      this.robots.set(origin, (async () => {
        try {
          const r = await this.get(origin + '/robots.txt', { robots: true, maxBytes: 1024 * 1024 });
          return robotsParser(origin + '/robots.txt', r.bytes.toString('utf8'));
        } catch (e) {
          if (e.httpStatus === 404) return robotsParser(origin + '/robots.txt', '');
          throw new CaptureError(`Robots policy unavailable: ${e.message}`, 'blocked');
        }
      })());
    }
    const parser = await this.robots.get(origin);
    if (parser.isAllowed(url, this.config.userAgent) === false)
      throw new CaptureError('Robots policy disallows this URL', 'blocked-robots');
  }
  async get(value, { robots = false, maxBytes = this.config.maxPageBytes } = {}) {
    let url = value;
    for (let hop = 0; hop <= 5; hop++) {
      url = await this.check(url, robots);
      if (!robots) await this.policy(url);
      const response = await this.request(url,maxBytes);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location) throw new CaptureError('Redirect without a destination');
        url = canonical(location, url);
        continue;
      }
      if (response.status < 200 || response.status >= 300) {
        const err = new CaptureError(`HTTP ${response.status}`, [401, 403, 429].includes(response.status) ? 'blocked-http' : 'failed');
        err.httpStatus = response.status;
        throw err;
      }
      return { bytes: response.bytes, finalUrl: url, status: response.status, headers: response.headers,
        contentType: response.headers['content-type'] || '', etag: response.headers.etag,
        lastModified: response.headers['last-modified'] };
    }
    throw new CaptureError('Redirect limit exceeded', 'blocked');
  }
  async request(url,maxBytes) {
    if (this.active < this.config.concurrency) this.active++;
    else await new Promise(resolve => this.waiters.push(resolve));
    try {
      await this.pace();
      return await this.rawRequest(url,maxBytes);
    } finally {
      const next = this.waiters.shift();
      if (next) next(); else this.active--;
    }
  }
  async rawRequest(url,maxBytes) {
    // Validate the actual socket lookup as well as discovery. This closes the
    // gap between a public DNS precheck and a later private-address resolution.
    return new Promise((resolve,reject) => {
      const req = (url.startsWith('https:') ? https : http).get(url, {
        headers: { 'User-Agent': this.config.userAgent, 'Accept-Encoding':'identity' },
        signal: AbortSignal.timeout(this.config.timeoutMs),
        lookup: (host,options,cb) => {
          dns.lookup(host,{all:true}).then(addresses => {
            if (!addresses.length || (!this.config.allowPrivateNetworks && addresses.some(a => isPrivate(a.address))))
              return cb(new CaptureError('Private socket destination excluded','blocked'));
            if (options.all) cb(null,addresses); else cb(null,addresses[0].address,addresses[0].family);
          }).catch(cb);
        }
      }, async res => {
        try {
          const status = res.statusCode, headers = res.headers;
          if (status < 200 || status >= 300) { res.destroy(); resolve({status,headers,bytes:Buffer.alloc(0)}); return; }
          if (Number(headers['content-length'] || 0) > maxBytes) throw new CaptureError('Response exceeds byte limit','oversize');
          const encoding = headers['content-encoding'];
          const decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
          if (encoding && encoding !== 'identity' && !decoder) throw new CaptureError('Unsupported content encoding');
          const source = decoder ? res.pipe(decoder) : res;
          if (decoder) res.on('error',e => decoder.destroy(e));
          const chunks=[];let size=0;
          for await (const chunk of source) {
            size+=chunk.length;
            if (size>maxBytes) throw new CaptureError('Stream exceeds byte limit','oversize');
            chunks.push(chunk);
          }
          resolve({status,headers,bytes:Buffer.concat(chunks)});
        } catch(e) { res.destroy();reject(e); }
      });
      req.on('error',reject);
    });
  }
  async render(url, waitForSelector) {
    // Explicit rendering only. No stealth, profiles, proxy escalation or form actions.
    await this.check(url); await this.policy(url);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, ...(this.config.browserChannel ? { channel: this.config.browserChannel } : {}) });
    try {
      const context = await browser.newContext({ userAgent: this.config.userAgent,
        serviceWorkers: 'block', acceptDownloads: false });
      const page = await context.newPage();
      let mainError;
      await context.route('**/*', async route => {
        if (route.request().method() !== 'GET') return route.abort();
        try {
          const r = await this.get(route.request().url());
          if (r.finalUrl !== route.request().url()) {
            await route.fulfill({status:302,headers:{location:r.finalUrl}});return;
          }
          const headers = Object.fromEntries(Object.entries(r.headers).filter(([k]) => !['content-length','content-encoding','transfer-encoding','connection','set-cookie'].includes(k)));
          await route.fulfill({ status: 200, headers, contentType: r.contentType, body: r.bytes });
        } catch (e) {
          if (route.request().isNavigationRequest() && route.request().frame() === page.mainFrame()) mainError = e;
          await route.abort();
        }
      });
      try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.config.timeoutMs }); }
      catch(e) { throw mainError || e; }
      if (mainError) throw mainError;
      if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: this.config.timeoutMs });
      const bytes = Buffer.from(await page.content());
      if (bytes.length > this.config.maxPageBytes) throw new CaptureError('Rendered page exceeds byte limit', 'oversize');
      return { bytes, finalUrl: page.url(), contentType: 'text/html; rendered', status: 200 };
    } finally { await browser.close(); }
  }
}

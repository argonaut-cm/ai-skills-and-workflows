import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { collect, loadProfile, exportReferences, search } from '../src/collector.mjs';
import { Network, canonical } from '../src/network.mjs';
import { feedItems, inspectDownload } from '../src/extract.mjs';
import { sha, readJson, lock } from '../src/store.mjs';

// Construct ZIP metadata directly: no package code is run or extracted.
function zip(name = 'plugin/readme.txt', mode = 0) {
  const n = Buffer.from(name), data = Buffer.from('fixture payload');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4);
  local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(n.length,26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x0314,4);
  central.writeUInt16LE(20,6); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24);
  central.writeUInt16LE(n.length,28); central.writeUInt32LE((mode << 16) >>> 0,38);
  const before = Buffer.concat([local,n,data]), directory = Buffer.concat([central,n]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1,8); end.writeUInt16LE(1,10);
  end.writeUInt32LE(directory.length,12); end.writeUInt32LE(before.length,16);
  return Buffer.concat([before,directory,end]);
}

async function fixture(t) {
  let revision = 1;
  let failFeedOnce = true;
  const requests = [];
  const server = http.createServer((req,res) => {
    requests.push(req.url);
    const u = new URL(req.url,'http://fixture');
    if (u.pathname === '/robots.txt') { res.end('User-agent: *\nDisallow: /blocked.zip\n'); return; }
    if (u.pathname === '/flaky-feed' && failFeedOnce) { failFeedOnce=false;res.writeHead(503);res.end('temporary');return; }
    if (u.pathname === '/feed' || u.pathname === '/flaky-feed') {
      const p = Number(u.searchParams.get('page') || 1);
      res.setHeader('Content-Type','application/rss+xml');
      res.end(`<rss xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>${p === 1 ? [1,2].map(i => `<item><title>Fixture ${i}</title><link>${base}/article/${i}</link><content:encoded><![CDATA[<h2>Content ${i}</h2><p>Reusable evidence revision ${revision} for article ${i}.</p>]]></content:encoded></item>`).join('') : ''}</channel></rss>`); return;
    }
    if (u.pathname.startsWith('/article/')) {
      const i = u.pathname.split('/').at(-1);
      res.setHeader('Content-Type','text/html');
      res.end(`<html><h1>Article ${i}</h1><article><p>Clean article ${i}, revision ${revision}, reusable evidence.</p><a href="/ok.zip">package</a><a href="/same.zip">same bytes</a><a href="/blocked.zip">excluded</a></article><div id="comments">private comments</div></html>`);return;
    }
    if (u.pathname === '/dynamic') {
      res.setHeader('Content-Type','text/html');
      res.end('<html><h1>Browser fixture</h1><article id="article"></article><script>document.querySelector("article").textContent="Rendered JavaScript content for independent browser verification."</script></html>');return;
    }
    if (['/ok.zip','/same.zip'].includes(u.pathname)) {res.setHeader('Content-Type','application/zip');res.end(zip());return;}
    if (u.pathname === '/wrong.zip') {res.setHeader('Content-Type','text/html');res.end('<html>Please login</html>');return;}
    if (u.pathname === '/large.zip') {res.setHeader('Content-Type','application/zip');res.setHeader('Content-Length',999999);res.end('bad');return;}
    if (u.pathname === '/stream.zip') {res.setHeader('Content-Type','application/zip');res.write(Buffer.alloc(2048));res.end(Buffer.alloc(2048));return;}
    if (u.pathname === '/redirect') {res.writeHead(302,{Location:'http://localhost:1/secret'});res.end();return;}
    if (u.pathname === '/denied') {res.writeHead(403);res.end('denied');return;}
    res.writeHead(404);res.end('missing');
  });
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'source-collector-'));
  t.after(async () => {
    server.closeAllConnections(); await new Promise(r => server.close(r));
    assert(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(dir).startsWith('source-collector-'));
    await fs.rm(dir,{recursive:true,force:true});
  });
  const configFile = path.join(dir,'profile.json');
  await fs.writeFile(configFile,JSON.stringify({ name:'independent-fixture',allowedHosts:['127.0.0.1'],allowPrivateNetworks:true,
    feeds:[{url:base+'/feed',pageUrl:base+'/feed?page={page}',pageSize:2,maxPages:3}],
    pageUrls:[base+'/article/1',base+'/article/2'],enrichFeedPages:'never',contentSelector:'article',
    intervalMs:0,concurrency:1,timeoutMs:5000,maxFileBytes:1024,maxFiles:10 }));
  return { base, dir, config:await loadProfile(configFile), requests, revise:() => revision++ };
}

test('real HTTP capture, objects, export, revisions, dedup and clean text', async t => {
  const f = await fixture(t), root=path.join(f.dir,'capture');
  const first=await collect(f.config,root);
  assert.equal(first.run.complete,true,JSON.stringify({feeds:first.run.feeds,tasks:first.run.tasks}));
  assert.equal(first.run.counts.articles,2);
  assert.equal(first.run.counts.downloads,2);
  assert.equal(first.run.counts.blockedByRobots,1);
  assert(!f.requests.includes('/blocked.zip'));
  const files=Object.values(first.run.downloads);
  assert.equal(files[0].sha256,files[1].sha256);
  assert.equal(files[0].inspection.entries[0].name,'plugin/readme.txt');
  for (const d of Object.values(first.run.documents)) {
    const body=await fs.readFile(path.join(root,d.body.path),'utf8');
    assert(!body.includes('private comments'));
    assert.equal(sha(Buffer.from(body)),d.body.sha256);
  }
  assert.equal((await search(root,'reusable evidence')).length,2);
  const dest=path.join(f.dir,'portable-collection');
  assert.equal(await exportReferences(root,dest),2);
  await assert.rejects(exportReferences(root,dest));
  f.revise();
  const next=await collect(f.config,root);
  assert(Object.values(next.run.documents).every(d => d.change === 'updated'));
  assert(await fs.stat(path.join(root,Object.values(first.run.documents)[0].body.path)));
  const last=await collect(f.config,root);
  assert(Object.values(last.run.documents).every(d => d.change === 'unchanged'));
});

test('checkpoint stop resumes pending work and keeps original change classifications', async t => {
  const f=await fixture(t),root=path.join(f.dir,'resume');
  const first=await collect(f.config,root,{stopAfter:1});
  assert.equal(first.run.complete,false);
  assert.equal((await readJson(path.join(root,'state.json'))).lastCompleteRun,null);
  const before=f.requests.filter(u => u === '/article/1').length;
  const resumed=await collect(f.config,root,{resume:first.run.id});
  assert.equal(resumed.run.complete,true,JSON.stringify({feeds:resumed.run.feeds,tasks:resumed.run.tasks}));
  assert.equal(f.requests.filter(u => u === '/article/1').length,before);
  assert(Object.values(resumed.run.documents).every(d => d.change === 'initial-fingerprint'));
  const downloaded=Object.values(resumed.run.downloads)[0];
  await fs.unlink(path.join(root,downloaded.path));
  const recovered=await collect(f.config,root,{resume:first.run.id});
  assert.equal(recovered.run.complete,true);
  assert.equal(sha(await fs.readFile(path.join(root,downloaded.path))),downloaded.sha256);
  await assert.rejects(collect({...f.config,name:'other-profile'},root));
});

test('robots, scope, credential URLs, redirects and response limits enforce boundaries', async t => {
  const f=await fixture(t),n=new Network(f.config);
  await assert.rejects(n.get(f.base+'/blocked.zip'),e => e.status === 'blocked-robots');
  await assert.rejects(n.get(f.base+'/denied'),e => e.status === 'blocked-http');
  await assert.rejects(n.get(f.base+'/redirect'),e => e.status === 'excluded-scope');
  await assert.rejects(n.get(f.base+'/large.zip',{maxBytes:100}),e => e.status === 'oversize');
  await assert.rejects(n.get(f.base+'/stream.zip',{maxBytes:100}),e => e.status === 'oversize');
  await assert.rejects(new Network({...f.config,allowPrivateNetworks:false}).get(f.base+'/feed'),e => e.status === 'blocked');
  assert.throws(() => canonical('https://example.com/?token=private'));
  assert.throws(() => canonical('https://user:password@example.com/'));
  await assert.rejects(inspectDownload(Buffer.from('<html>login</html>'),f.base+'/wrong.zip','text/html'),e => e.status === 'invalid-download');
  await assert.rejects(inspectDownload(zip('../escape.txt'),f.base+'/bad.zip','application/zip'));
  await assert.rejects(inspectDownload(zip('link',0xa000),f.base+'/link.zip','application/zip'),e => e.status === 'unsafe-archive');
});

test('capped, inaccessible and incomplete pagination never advance completion', async t => {
  const f=await fixture(t);
  assert.equal((await collect(f.config,path.join(f.dir,'capped'),{limit:1})).run.complete,false);
  const bad={...f.config,feeds:[{url:f.base+'/denied'}],pageUrls:[]};
  const r=await collect(bad,path.join(f.dir,'denied'));
  assert.equal(r.run.complete,false);
  assert(Object.values(r.run.feeds)[0].error.includes('403'));
  const truncated={...f.config,feeds:[{...f.config.feeds[0],maxPages:1}],pageUrls:[]};
  assert.equal((await collect(truncated,path.join(f.dir,'truncated'))).run.complete,false);
});

test('RSS and Atom parsing supports full content and marks excerpts', () => {
  const atom=feedItems(Buffer.from('<feed><entry><title>A &amp; B</title><link href="https://example.com/a"/><content>&lt;p&gt;Full body&lt;/p&gt;</content></entry></feed>'));
  assert.equal(atom[0].title,'A & B');assert.equal(atom[0].html,'<p>Full body</p>');
  assert.equal(feedItems(Buffer.from('<rss><channel><item><title>Excerpt</title><link>https://example.com/</link><description>Short</description></item></channel></rss>'))[0].bodyKind,'description-only');
  assert.throws(() => feedItems(Buffer.from('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><rss/>')));
});

test('single-writer guard refuses a live owner', async t => {
  const f=await fixture(t),root=path.join(f.dir,'locked');
  const release=await lock(root);await assert.rejects(lock(root),/live writer/);await release();
});

test('transient feed failure resumes and file budgets defer rather than claim completion', async t => {
  const f=await fixture(t);
  const config={...f.config,feeds:[{...f.config.feeds[0],url:f.base+'/flaky-feed',pageUrl:f.base+'/flaky-feed?page={page}'}],pageUrls:[]};
  const root=path.join(f.dir,'flaky');
  const failed=await collect(config,root);
  assert.equal(failed.run.complete,false);
  const recovered=await collect(config,root,{resume:failed.run.id});
  assert.equal(recovered.run.complete,true);
  const limited={...f.config,maxFiles:1};
  const budgetRoot=path.join(f.dir,'budget');
  let result=await collect(limited,budgetRoot);
  assert.equal(result.run.complete,false);
  assert.equal(result.run.counts.downloads,1);
  for(let i=0;i<3 && !result.run.complete;i++) result=await collect(limited,budgetRoot,{resume:result.run.id});
  assert.equal(result.run.complete,true);
});

test('explicit browser mode captures real JavaScript-rendered content', {skip: !process.env.COLLECTOR_TEST_BROWSER_CHANNEL}, async t => {
  const f=await fixture(t),n=new Network({...f.config,browserChannel:process.env.COLLECTOR_TEST_BROWSER_CHANNEL});
  const result=await n.render(f.base+'/dynamic','article:has-text("Rendered JavaScript")');
  assert(result.bytes.toString().includes('Rendered JavaScript content for independent browser verification.'));
  await assert.rejects(n.render(f.base+'/denied'),e => e.status === 'blocked-http');
});

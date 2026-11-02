#!/usr/bin/env node
import path from 'node:path';
import { parseArgs } from 'node:util';
import { collect, loadProfile, search, exportReferences } from './collector.mjs';

const help = `Source Collector 0.1
  node src/cli.mjs collect --config profiles/example.json --output /path/to/work
  node src/cli.mjs collect --config profiles/example.json --output /path/to/work --feeds-only
  node src/cli.mjs collect --config profiles/example.json --output /path/to/work --resume RUN_ID
  node src/cli.mjs search --output /path/to/work --query "search terms"
  node src/cli.mjs export --output /path/to/work --destination /new/collection-slug
Options: --limit N (partial run), --stop-after N (checkpoint exercise), --resume RUN_ID.
No downloaded code is installed or executed. No credentials or hosted AI services are used.`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    config: { type:'string' }, output: { type:'string' }, resume: { type:'string' },
    query: { type:'string' }, destination: { type:'string' }, limit: { type:'string' },
    'stop-after': { type:'string' }, 'feeds-only': { type:'boolean' }, help: { type:'boolean' } } });
  const [command] = positionals;
  if (values.help || !command) { console.log(help); }
  else {
    if (!values.output) throw Error('--output is required');
    const root = path.resolve(values.output);
    if (command === 'collect') {
      if (!values.config) throw Error('--config is required');
      const config = await loadProfile(path.resolve(values.config));
      for (const key of ['limit','stop-after']) if (values[key] && (!/^\d+$/.test(values[key]) || Number(values[key]) < 1)) throw Error(`Invalid --${key}`);
      const { run, runFile } = await collect(config,root,{ resume: values.resume,
        feedsOnly: values['feeds-only'], limit: Number(values.limit) || undefined, stopAfter: Number(values['stop-after']) || undefined });
      console.log(JSON.stringify({ id: run.id, complete: run.complete, counts: run.counts, manifest: runFile },null,2));
      if (!run.complete) process.exitCode = 2;
    } else if (command === 'search') {
      if (!values.query) throw Error('--query is required');
      console.log(JSON.stringify(await search(root,values.query),null,2));
    } else if (command === 'export') {
      if (!values.destination) throw Error('--destination is required');
      console.log(JSON.stringify({ exported: await exportReferences(root,path.resolve(values.destination)), destination: path.resolve(values.destination) }));
    } else throw Error('Unknown command; use --help');
  }
} catch (e) { console.error(e.message); process.exitCode = 1; }

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const sha = data => createHash('sha256').update(data).digest('hex');
export const now = () => new Date().toISOString();
export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(temp, file);
}
export async function object(root, bytes, ext) {
  bytes = Buffer.from(bytes);
  const hash = sha(bytes), rel = `objects/${hash}.${ext}`;
  await fs.mkdir(path.join(root, 'objects'), { recursive: true });
  try { await fs.writeFile(path.join(root, rel), bytes, { flag: 'wx' }); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (sha(await fs.readFile(path.join(root, rel))) !== hash) throw Error('Stored object integrity failure');
  }
  return { path: rel, sha256: hash, bytes: bytes.length };
}
export async function lock(root) {
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, '.writer.lock');
  try { await fs.writeFile(file, JSON.stringify({ pid: process.pid, started: now() }), { flag: 'wx' }); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = await readJson(file);
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (err) { if (err.code === 'ESRCH') alive = false; }
    if (alive) throw Error(`Output already has a live writer (PID ${owner.pid})`);
    await fs.unlink(file);
    return lock(root);
  }
  return () => fs.unlink(file);
}

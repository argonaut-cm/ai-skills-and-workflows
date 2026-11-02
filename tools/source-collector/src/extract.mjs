import { load } from 'cheerio';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import TurndownService from 'turndown';
import yauzl from 'yauzl';
import path from 'node:path';
import { canonical, CaptureError } from './network.mjs';

const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
const array = x => x === undefined ? [] : Array.isArray(x) ? x : [x];
const text = x => typeof x === 'object' ? x?.['#text'] || '' : String(x ?? '');

export function feedItems(bytes) {
  const xml = bytes.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CaptureError('XML declarations/entities are not admitted');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new CaptureError('Invalid XML feed');
  const doc = new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(xml);
  const rss = doc.rss?.channel;
  if (doc.rss && Object.hasOwn(doc.rss,'channel')) return array(rss?.item).map(i => ({ url: text(i.link), title: text(i.title),
    author: text(i['dc:creator']), published: text(i.pubDate), html: text(i['content:encoded'] || i.description),
    bodyKind: i['content:encoded'] ? 'full-content-field' : 'description-only',
    enclosures: array(i.enclosure).map(e => e['@_url']).filter(Boolean) }));
  if (Object.hasOwn(doc,'feed')) return array(doc.feed?.entry).map(i => ({
    url: array(i.link).find(l => !l['@_rel'] || l['@_rel'] === 'alternate')?.['@_href'],
    title: text(i.title), author: text(i.author?.name), published: text(i.published || i.updated),
    html: text(i.content || i.summary), bodyKind: i.content ? 'full-content-field' : 'description-only',
    enclosures: array(i.link).filter(l => l['@_rel'] === 'enclosure').map(l => l['@_href']) }));
  throw new CaptureError('Response is not an RSS or Atom feed');
}

export function extractHtml(html, url, config, feed = false) {
  const $ = load(html);
  let section = feed ? $('body') : $(config.contentSelector).first();
  if (!section.length) throw new CaptureError(`Content selector missing: ${config.contentSelector}`);
  section.find(config.removeSelector || 'script,style,noscript,form,nav,footer').remove();
  const title = feed ? null : $(config.titleSelector || 'h1').first().text().trim();
  const links = [];
  for (const element of section.find('a[href],img[src]').toArray()) {
    const attr = element.tagName === 'img' ? 'src' : 'href';
    try { $(element).attr(attr, canonical($(element).attr(attr), url)); }
    catch { $(element).removeAttr(attr); }
  }
  // Attachment controls may sit outside the article body, but never in comments.
  const controls = feed ? section : $(config.downloadSelector || 'a[href]');
  for (const a of controls.find('a[href]').addBack('a[href]').toArray()) {
    if ($(a).closest('#comments,.comments,.comment-list').length) continue;
    try {
      const href = canonical($(a).attr('href'), url);
      const ext = path.posix.extname(new URL(href).pathname).toLowerCase();
      if (config.downloadExtensions.includes(ext)) links.push(href);
    } catch { /* Excluded credential/query links are not persisted. */ }
  }
  const cleaned = section.html() || '';
  const md = markdown.turndown(cleaned).trim() + '\n';
  if (md.trim().length < (config.minTextCharacters ?? 20)) throw new CaptureError('Extracted article is empty or too short');
  return { title, html: cleaned, markdown: md, links: [...new Set(links)] };
}

export async function inspectDownload(bytes, url, contentType) {
  const ext = path.posix.extname(new URL(url).pathname).toLowerCase();
  const start = bytes.subarray(0, 512).toString('utf8').trimStart();
  if (ext !== '.html' && (/text\/html|application\/xhtml/i.test(contentType) || /^<!doctype html|^<html/i.test(start)))
    throw new CaptureError('HTML/login/error response returned instead of the expected file', 'invalid-download');
  const zipSignature = bytes.length >= 4 && [0x04034b50,0x06054b50].includes(bytes.readUInt32LE(0));
  if (['.zip', '.sxp', '.sqx', '.sqb'].includes(ext) || zipSignature || /application\/(?:x-)?zip/i.test(contentType)) {
    if (bytes.length < 4 || (bytes.readUInt32LE(0) !== 0x04034b50 && bytes.readUInt32LE(0) !== 0x06054b50))
      throw new CaptureError('Expected ZIP container signature missing', 'invalid-download');
    const entries = [];
    await new Promise((resolve, reject) => {
      yauzl.fromBuffer(bytes, { lazyEntries: true, decodeStrings: true }, (error, zip) => {
        if (error) return reject(error);
        let expanded = 0;
        zip.on('error', reject);
        zip.on('end', resolve);
        zip.on('entry', entry => {
          const name = entry.fileName.replaceAll('\\', '/');
          expanded += entry.uncompressedSize;
          const mode = entry.externalFileAttributes >>> 16;
          if (name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')
            || (mode & 0xf000) === 0xa000 || entries.length >= 10000 || expanded > 1024 ** 3
            || (entry.uncompressedSize > 1024 ** 2 && entry.uncompressedSize / Math.max(1, entry.compressedSize) > 1000)) {
            zip.close(); return reject(new CaptureError('Unsafe archive path, symlink or expansion limits', 'unsafe-archive'));
          }
          entries.push({ name, bytes: entry.uncompressedSize, compressedBytes: entry.compressedSize });
          zip.readEntry();
        });
        zip.readEntry();
      });
    }).catch(e => { throw e instanceof CaptureError ? e : new CaptureError(e.message, /invalid.*(path|file)|absolute path/i.test(e.message) ? 'unsafe-archive' : 'invalid-download'); });
    return { type: 'zip', entries, validation: 'central-directory-only; not extracted or executed' };
  }
  if (ext === '.pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
    throw new CaptureError('Expected PDF signature missing', 'invalid-download');
  return { type: ext.slice(1), validation: 'size/type checked; no source execution or functional validation' };
}

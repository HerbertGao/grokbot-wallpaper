// Office channel resolution and the Pages Function that may supply it.
// Topics here are fake (gbw-test-topic-xxxxx). Nothing in this file is a production channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { feedFromLink, resolveOfficeFeed, topicToken } from '../../web/lib/feedbase.js';
import { feedFromHash } from '../../web/feed.js';
import {
  DEFAULT_TOPIC_HOST, bootstrapScript, injectBootstrap, queryHasTopic, readDefaultTopic, shouldInjectDefaultTopic,
} from '../../functions/default-topic.js';
import { onRequest } from '../../functions/_middleware.js';

const execFileAsync = promisify(execFile);
const root = new URL('../../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const TOPIC = 'gbw-test-topic-xxxxx';
const OTHER = 'gbw-test-topic-yyyyy';
const html = '<!doctype html><html><head><title>Office</title></head><body><script type="module" src="./app.js"></script></body></html>';

test('office feed: link, then gbw.feed sticky, then __GBW_DEFAULT_TOPIC__', () => {
  assert.equal(topicToken(`  #${TOPIC}@relay.example.com`), TOPIC);   // face.js may store a fragment; we keep the bare topic
  assert.equal(topicToken(`${TOPIC}&ntfy=https://ntfy.example.org`), TOPIC);
  assert.equal(topicToken('short'), null);
  assert.equal(topicToken('https://ntfy.sh/' + TOPIC), null);
  assert.equal(topicToken('relay.example.com'), null);

  const link = resolveOfficeFeed({
    hash: `#${TOPIC}@relay.example.com`, search: '', pathname: '/office/', sticky: OTHER, defaultTopic: 'gbw-test-topic-zzzzz',
  });
  assert.equal(link.source, 'link');
  assert.equal(link.topic, TOPIC);             // remembered value is the bare topic, same shape as face.js gbw.feed
  assert.equal(link.replace, null);            // the URL already names a feed
  assert.equal(link.hash, `#${TOPIC}@relay.example.com`);

  const query = resolveOfficeFeed({ search: `?feed=${TOPIC}`, pathname: '/office/', sticky: OTHER, defaultTopic: OTHER });
  assert.equal(query.source, 'link');
  assert.equal(query.topic, TOPIC);
  assert.equal(query.replace, null);

  const sticky = resolveOfficeFeed({
    search: '?mode=wallpaper&floor=top', pathname: '/office/', sticky: ` #${TOPIC}@ignored.example `, defaultTopic: OTHER,
  });
  assert.equal(sticky.source, 'sticky');
  assert.equal(sticky.topic, TOPIC);
  assert.equal(sticky.hash, `#${TOPIC}`);
  assert.equal(sticky.replace, `/office/?mode=wallpaper&floor=top#${TOPIC}`);
  assert.equal(feedFromHash(sticky.hash, sticky.search).topic, TOPIC);

  // ?feed=<mailbox> is not a topic. The sticky topic is adopted and the mailbox query stays.
  const mailbox = resolveOfficeFeed({ search: '?feed=relay.example.com', pathname: '/office/', sticky: TOPIC });
  assert.equal(mailbox.source, 'sticky');
  assert.equal(mailbox.replace, `/office/?feed=relay.example.com#${TOPIC}`);
  assert.equal(feedFromLink({ hash: mailbox.hash, search: mailbox.search }).base, 'https://relay.example.com/');

  const fallback = resolveOfficeFeed({ pathname: '/office/', sticky: 'nope', defaultTopic: `  ${TOPIC}  ` });
  assert.deepEqual(fallback, {
    source: 'default', topic: TOPIC, hash: `#${TOPIC}`, search: '', replace: `/office/#${TOPIC}`,
  });

  assert.equal(resolveOfficeFeed({ pathname: '/office/', sticky: '', defaultTopic: '' }), null);
  assert.equal(resolveOfficeFeed({ pathname: '/office/', defaultTopic: '<script>' }), null);
  assert.equal(resolveOfficeFeed({ hash: '#short', sticky: '', defaultTopic: '   ' }), null);
});

test('Pages Function: inject DEFAULT_TOPIC only on bot.heapcn.dev /office HTML without a query topic', async () => {
  const samples = ['', '?mode=wallpaper', '?feed=relay.example.com', `?feed=${TOPIC}`, '?feed=short', '?feed=https://ntfy.example/x'];
  for (const search of samples) assert.equal(queryHasTopic(search), !!feedFromLink({ search }), search);

  const yes = { host: DEFAULT_TOPIC_HOST, pathname: '/office/', search: '', defaultTopic: TOPIC };
  assert.equal(shouldInjectDefaultTopic(yes), true);
  assert.equal(shouldInjectDefaultTopic({ ...yes, host: 'Bot.Heapcn.dev:443' }), true);
  assert.equal(shouldInjectDefaultTopic({ ...yes, pathname: '/office' }), true);
  assert.equal(shouldInjectDefaultTopic({ ...yes, pathname: '/office/index.html' }), true);
  assert.equal(shouldInjectDefaultTopic({ ...yes, search: '?feed=relay.example.com&mode=wallpaper' }), true);

  for (const host of ['project.pages.dev', 'bot.heapcn.dev.pages.dev', 'www.bot.heapcn.dev', 'github.io', 'localhost', 'bot.heapcn.dev.evil.com']) {
    assert.equal(shouldInjectDefaultTopic({ ...yes, host }), false, host);
  }
  for (const pathname of ['/', '/face/', '/offices', '/office-preview/']) {
    assert.equal(shouldInjectDefaultTopic({ ...yes, pathname }), false, pathname);
  }
  assert.equal(shouldInjectDefaultTopic({ ...yes, search: `?feed=${TOPIC}` }), false);
  assert.equal(shouldInjectDefaultTopic({ ...yes, defaultTopic: '' }), false);
  assert.equal(shouldInjectDefaultTopic({ ...yes, defaultTopic: 'short' }), false);
  assert.equal(shouldInjectDefaultTopic({ ...yes, defaultTopic: `${TOPIC}"</script>` }), false);
  assert.equal(readDefaultTopic({}), '');
  assert.equal(readDefaultTopic({ DEFAULT_TOPIC: 1 }), '');
  assert.equal(readDefaultTopic({ DEFAULT_TOPIC: `  ${TOPIC}\n` }), TOPIC);

  const script = bootstrapScript(TOPIC);
  assert.equal(script, `window.__GBW_DEFAULT_TOPIC__=${JSON.stringify(TOPIC)}`);
  assert.equal(injectBootstrap(html, TOPIC).indexOf(`<head>${`<script>${script}</script>`}`), html.indexOf('<head>'));
  assert.equal(injectBootstrap('<html><body>x</body></html>', TOPIC).startsWith(`<script>${script}</script>`), true);

  const injected = await onRequest({
    request: new Request(`https://${DEFAULT_TOPIC_HOST}/office/?mode=wallpaper`, { headers: { host: DEFAULT_TOPIC_HOST } }),
    env: { DEFAULT_TOPIC: TOPIC },
    async next() {
      return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"office"' } });
    },
  });
  const body = await injected.text();
  assert.match(body, new RegExp(`<head><script>${script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</script>`));
  assert.equal(injected.headers.get('cache-control'), 'private, no-store');
  assert.equal(injected.headers.get('etag'), null);
  assert.match(body, /src="\.\/app\.js"/);

  const preview = await onRequest({
    request: new Request('https://project.pages.dev/office/'),
    env: { DEFAULT_TOPIC: TOPIC },
    async next() { return new Response(html, { headers: { 'content-type': 'text/html' } }); },
  });
  assert.equal(await preview.text(), html);
  assert.equal(preview.headers.get('cache-control'), null);

  const scriptFile = await onRequest({
    request: new Request(`https://${DEFAULT_TOPIC_HOST}/office/app.js`),
    env: { DEFAULT_TOPIC: TOPIC },
    async next() { return new Response('export {}', { headers: { 'content-type': 'text/javascript' } }); },
  });
  assert.equal(await scriptFile.text(), 'export {}');

  const already = await onRequest({
    request: new Request(`https://${DEFAULT_TOPIC_HOST}/office/?feed=${TOPIC}`),
    env: { DEFAULT_TOPIC: OTHER },
    async next() { return new Response(html, { headers: { 'content-type': 'text/html' } }); },
  });
  assert.equal(await already.text(), html);
});

test('no default topic is baked into the office, the function, or the assembled upload', async () => {
  const sources = ['web/app.js', 'web/lib/feedbase.js', 'functions/_middleware.js', 'functions/default-topic.js', 'landing/assemble.mjs'];
  for (const file of sources) {
    const src = await read(file);
    assert.doesNotMatch(src, /__GBW_DEFAULT_TOPIC__\s*=\s*['"`]/, file);
    assert.doesNotMatch(src, /DEFAULT_TOPIC\s*[:=]\s*['"`]/, file);
    assert.doesNotMatch(src, /gbw-[A-Za-z0-9_-]{8,}/, file);
  }

  const out = await mkdtemp(path.join(tmpdir(), 'gbw-assemble-'));
  try {
    await execFileAsync(process.execPath, [path.join(root.pathname, 'landing/assemble.mjs'), out]);
    for (const name of ['_middleware.js', 'default-topic.js']) {
      const copied = await readFile(path.join(out, 'functions', name), 'utf8');
      assert.equal(copied, await read(`functions/${name}`));
    }
    const officeApp = await readFile(path.join(out, 'office/app.js'), 'utf8');
    assert.match(officeApp, /__GBW_DEFAULT_TOPIC__/);
    assert.match(officeApp, /gbw\.feed/);
    const routes = JSON.parse(await readFile(path.join(out, '_routes.json'), 'utf8'));
    assert.deepEqual(routes, { version: 1, include: ['/office', '/office/', '/office/index.html'], exclude: [] });
    assert.doesNotMatch(JSON.stringify(routes), /gbw-/);
    const entries = await readdir(out);
    assert.equal(entries.includes('functions'), true);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

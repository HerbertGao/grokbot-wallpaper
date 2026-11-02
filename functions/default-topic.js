// Host gate for the office's default channel. The topic itself is never in this file: Pages sets env.DEFAULT_TOPIC
// (a secret or encrypted variable on the bot.heapcn.dev project). Public hosts — *.pages.dev, github.io, localhost —
// keep the demo. The hash is not on the request (Cloudflare Access does not forward it); only the query can already
// name a topic, and then we leave the HTML alone.

export const DEFAULT_TOPIC_HOST = 'bot.heapcn.dev';

const TOPIC = /^[A-Za-z0-9_-]{6,64}$/;

/** Hostname from a Host header: lowercased, port stripped. Not X-Forwarded-Host. */
export function requestHost(hostHeader) {
  let raw = String(hostHeader ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end === -1 ? raw : raw.slice(0, end + 1);
  }
  return raw.split(':')[0];
}

export function isOfficePath(pathname) {
  return pathname === '/office' || pathname.startsWith('/office/');
}

/** True when ?feed= is a bare topic (the older wallpaper link). A mailbox (?feed=host or https URL) is not one —
 *  the same rule as feedFromLink in web/lib/feedbase.js. */
export function queryHasTopic(search) {
  const q = new URLSearchParams(search).get('feed');
  return !!q && TOPIC.test(q);
}

export function readDefaultTopic(env) {
  const raw = env?.DEFAULT_TOPIC;
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Inject the client bootstrap only for this host, under /office, with a usable env topic and no topic in the query. */
export function shouldInjectDefaultTopic({ host, pathname, search = '', defaultTopic = '' } = {}) {
  if (requestHost(host) !== DEFAULT_TOPIC_HOST) return false;
  if (!isOfficePath(pathname)) return false;
  if (queryHasTopic(search)) return false;
  return TOPIC.test(String(defaultTopic ?? '').trim());
}

/** Inline classic script. JSON.stringify keeps the value a string literal; the topic charset cannot close the tag. */
export function bootstrapScript(topic) {
  return `window.__GBW_DEFAULT_TOPIC__=${JSON.stringify(String(topic).trim())}`;
}

/** Put the bootstrap first in <head> so it runs before the deferred module ./app.js. */
export function injectBootstrap(html, topic) {
  const tag = `<script>${bootstrapScript(topic)}</script>`;
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (m) => `${m}${tag}`);
  return tag + html;
}

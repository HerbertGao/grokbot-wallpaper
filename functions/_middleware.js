// Pages middleware: on bot.heapcn.dev, HTML under /office gets window.__GBW_DEFAULT_TOPIC__ from env.DEFAULT_TOPIC.
// The browser then does location.replace to /office/#<topic> (web/app.js), so the topic is not a static file and
// Cloudflare Access still sees a hashless URL. Every other host, including the project's *.pages.dev, is unchanged.
//
// Deploy:
//   Git-connected Pages compiles /functions at the repository root. Build command: node landing/assemble.mjs _site
//   Output directory: _site. Do not put the topic in wrangler.toml [vars] or in the build output.
//   Set DEFAULT_TOPIC in the Pages project → Settings → Variables and Secrets (Encrypt), Production.
//   `npx wrangler pages secret put DEFAULT_TOPIC` also works; Wrangler prompts for the value, so it stays off argv.
//   Ad-hoc `npx wrangler pages deploy _site` must run from the repository root: Wrangler compiles ./functions next
//   to the command, not a functions/ folder inside the asset directory. Dashboard drag-and-drop does not compile
//   functions (it would upload them as static files). Assemble copies functions/ into _site and writes
//   _routes.json there so only /office HTML invokes this Function. Run assemble before an ad-hoc deploy.
import { injectBootstrap, readDefaultTopic, shouldInjectDefaultTopic } from './default-topic.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const topic = readDefaultTopic(context.env);
  if (!shouldInjectDefaultTopic({
    host: context.request.headers.get('host') || url.host,
    pathname: url.pathname,
    search: url.search,
    defaultTopic: topic,
  })) return context.next();

  const response = await context.next();
  const type = response.headers.get('content-type') || '';
  if (response.status !== 200 || !/^text\/html\b/i.test(type)) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('etag');
  headers.set('cache-control', 'private, no-store');
  const vary = headers.get('vary');
  if (!vary) headers.set('vary', 'Host');
  else if (!/\bhost\b/i.test(vary)) headers.set('vary', `${vary}, Host`);
  return new Response(injectBootstrap(await response.text(), topic), { status: response.status, headers });
}

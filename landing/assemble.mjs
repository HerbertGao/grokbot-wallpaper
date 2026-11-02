// Assembles the public Grok Bot Wallpaper site into one folder: the landing page at its root, the live wallpaper at
// face/ and the 3D office at office/, with their demo data and the assets both load from ../assets/. The same tree
// goes to GitHub Pages for this fork (.github/workflows/pages.yml):
// https://herbertgao.github.io/grokbot-wallpaper/ with the office at office/#<topic>.
// Only these files go out: no journal, keys, source art, test pages or preview renders.
// A new file the site needs is added here, once, for both sites.
//   node landing/assemble.mjs <out-dir>
//
// functions/ is the Cloudflare Pages Function that injects window.__GBW_DEFAULT_TOPIC__ from env.DEFAULT_TOPIC.
// The topic is not in the source and is not written into this folder. GitHub Pages serves the copy as a static file
// (it does not run it). Wrangler compiles the functions directory that sits next to the command: repository-root
// `functions/` for `npx wrangler pages deploy _site`, or this copy for `npx wrangler pages deploy .` inside the
// output. Dashboard drag-and-drop does not compile a functions folder.
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..');
const out = path.resolve(process.argv[2] || '_site');
const parts = [
  // [from, to, which files, { deep: also its subfolders, optional: may not exist yet }]
  ['landing', '.', /^(index\.html|icon\.png|og\.png)$/],
  ['landing/fonts', 'fonts', /\.woff2$/],
  ['landing/media', 'media', /\.(mp4|jpg)$/],
  ['.', '.', /^PROMPT\.md$/, { optional: true }],          // the one setup prompt, shown on the landing as it is
  ['web/face', 'face', /^(index\.html|face\.css|face\.js)$/],
  ['web/data', 'data', /^demo-(state|looks)\.json$/],
  // the 3D office: its page and modules (no *.html test pages), its demo data
  ['web', 'office', /^(index\.html|app\.js|styles\.css|wallpaper\.js|feed\.js)$/],
  ['web/lib', 'office/lib', /\.(js|css|json)$/, { deep: true, optional: true }],
  ['web/scene', 'office/scene', /\.(js|css)$/],
  ['web/ui', 'office/ui', /\.(js|css)$/],
  ['web/audio', 'office/audio', /\.(js|m4a)$/],
  ['web/share', 'office/share', /\.(js|css)$/],
  ['web/data', 'office/data', /^demo-(state|looks)\.json$/],
  // assets, shared by the wallpaper and the office (no preview renders, no office-v1.glb)
  ['assets/face', 'assets/face', /^(sphere(-black)?\.png|eye-.+\.png|eyes\.json|grain\.png)$/],
  ['assets/blobs', 'assets/blobs', /\.glb$/],
  ['assets/blobs/thumbs', 'assets/blobs/thumbs', /\.png$/],
  ['assets/blobs/lib', 'assets/blobs/lib', /\.(png|json)$/, { optional: true }],
  ['assets/office', 'assets/office', /^office\.glb$/],
  ['assets/office/night', 'assets/office/night', /\.jpg$/],
  ['assets/brand', 'assets/brand', /\.(png|svg)$/],
  ['assets/earth', 'assets/earth', /^(day|night)\.jpg$/],
  // Pages Function source only. No topic value: it reads env.DEFAULT_TOPIC when the request host is bot.heapcn.dev.
  ['functions', 'functions', /\.js$/, { deep: true }],
];

function copy(src, dst, keep, deep) {
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.isDirectory()) { if (deep) n += copy(path.join(src, e.name), path.join(dst, e.name), keep, deep); continue; }
    if (!keep.test(e.name)) continue;
    fs.mkdirSync(dst, { recursive: true });
    fs.copyFileSync(path.join(src, e.name), path.join(dst, e.name));
    n++;
  }
  return n;
}

let total = 0;
for (const [from, to, keep, { deep = false, optional = false } = {}] of parts) {
  const src = path.join(repo, from);
  const n = fs.existsSync(src) ? copy(src, path.join(out, to), keep, deep) : 0;
  if (!n && !optional) throw new Error(`nothing to copy from ${from}/ (expected ${keep})`);
  total += n;
}

// web/face/face.js imports ../ui/ui.js, which is web/ui/ui.js in the repo. This tree publishes that module at
// office/ui/ui.js (every office file uses the same relative path). Retarget the wallpaper copy only. A second copy
// at /ui/ui.js would make ../../assets (import.meta.url in ui.js) leave a GitHub Pages subpath.
const faceJs = path.join(out, 'face/face.js');
const faceImport = "import { LABEL } from '../ui/ui.js';";
const faceSrc = fs.readFileSync(faceJs, 'utf8');
if (faceSrc.split(faceImport).length !== 2) throw new Error(`face/face.js: expected one ${faceImport}`);
fs.writeFileSync(faceJs, faceSrc.replace(faceImport, "import { LABEL } from '../office/ui/ui.js';"));
if (!fs.existsSync(path.join(out, 'office/ui/ui.js'))) throw new Error('office/ui/ui.js missing after assemble');

// Without this file, Pages invokes the Function for every request (landing, wallpaper, glb). Only the office HTML
// needs it: that is where the default topic is injected. Static files stay on the free unlimited path.
const routes = {
  version: 1,
  include: ['/office', '/office/', '/office/index.html'],
  exclude: [],
};
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, '_routes.json'), `${JSON.stringify(routes, null, 2)}\n`);
console.log(`assembled ${total} files into ${out}`);

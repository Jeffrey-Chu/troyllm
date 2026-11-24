// Builds the club sites into club-sites/dist/<site>/ with no third-party scripts:
// inline scripts become files (so the CSP can forbid inline JS), Firebase is bundled,
// and TLL's React/Tailwind/Babel CDN copies are replaced by a local bundle and CSS file.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const tmp = join(here, '.build');
rmSync(dist, { recursive: true, force: true });
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const bundle = (entryPoints, outfile, extra = {}) => build({
  entryPoints, outfile, bundle: true, format: 'iife', minify: true, target: 'es2020', legalComments: 'none', ...extra,
});

for (const site of ['vsa', 'superdw', 'carclub']) {
  const src = join(here, 'sites', site);
  const out = join(dist, site);
  mkdirSync(out, { recursive: true });
  if (existsSync(join(src, 'img'))) cpSync(join(src, 'img'), join(out, 'img'), { recursive: true });
  let html = readFileSync(join(src, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m || /<script>/.test(html.replace(m[0], ''))) throw new Error(`${site}: expected exactly one inline script`);
  writeFileSync(join(out, 'site.js'), `${m[1]}\ndocument.querySelectorAll('[data-yr-twdc]').forEach((e) => { e.textContent = new Date().getFullYear(); });\n`);
  html = html.replace(m[0], '<script src="fb.js"></script>\n<script src="site.js"></script>');
  writeFileSync(join(out, 'index.html'), html);
  await bundle([join(here, 'src', `${site}.js`)], join(out, 'fb.js'));
}

// Troy Learning League: precompile JSX and Tailwind.
{
  const src = join(here, 'sites', 'tll');
  const out = join(dist, 'tll');
  mkdirSync(out, { recursive: true });
  cpSync(join(src, 'img'), join(out, 'img'), { recursive: true });
  let html = readFileSync(join(src, 'index.html'), 'utf8');
  const cfg = html.match(/<script>\s*tailwind\.config\s*=\s*([\s\S]*?);?\s*<\/script>/);
  const jsx = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
  if (!cfg || !jsx) throw new Error('tll: script blocks not found');
  writeFileSync(join(tmp, 'app.jsx'),
    `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport { TLL } from '../src/tll.js';\n${jsx[1]}`);
  writeFileSync(join(tmp, 'tailwind.config.cjs'),
    `module.exports = { content: [${JSON.stringify(join(tmp, 'app.jsx'))}], ...${cfg[1]} };`);
  writeFileSync(join(tmp, 'in.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
  execFileSync(process.execPath, [join(here, '..', 'node_modules', 'tailwindcss', 'lib', 'cli.js'),
    '-c', join(tmp, 'tailwind.config.cjs'), '-i', join(tmp, 'in.css'), '-o', join(out, 'app.css'), '--minify'],
  { stdio: 'inherit' });
  await bundle([join(tmp, 'app.jsx')], join(out, 'app.js'), {
    jsx: 'transform', loader: { '.jsx': 'jsx' }, define: { 'process.env.NODE_ENV': '"production"' },
  });
  html = html
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/, '')
    .replace(cfg[0], '<link rel="stylesheet" href="app.css" />')
    .replace(/<script src="https:\/\/cdnjs\.cloudflare\.com[^"]*"><\/script>\s*/g, '')
    .replace(jsx[0], '<script src="app.js"></script>');
  if (/<script(?![^>]*\bsrc=)/.test(html) || /cdn|cdnjs/.test(html.match(/<script[^>]*>/g).join(''))) throw new Error('tll: leftover inline or CDN script');
  writeFileSync(join(out, 'index.html'), html);
}

// Static sites (no sign-in, no Firebase): copied as they are. Their CSP in firebase.json allows
// inline scripts because the pages use inline onclick handlers.
const staticSites = ['anime', 'chinese', 'leo', 'roots', 'science', 'hub', 'geo', 'key', 'webdev'];
for (const site of staticSites) {
  const src = join(here, 'sites', site);
  if (!existsSync(join(src, 'index.html'))) throw new Error(`${site}: index.html missing`);
  cpSync(src, join(dist, site), { recursive: true });
}

rmSync(tmp, { recursive: true, force: true });
console.log(`Built club-sites/dist: vsa, tll, superdw, carclub, ${staticSites.join(', ')}`);

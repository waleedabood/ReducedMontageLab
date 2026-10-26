// Builds dist/ReducedMontageLab.html: the whole lab in one self-contained file that opens by double-click, offline,
// with no server. Browsers refuse to load separate module files from disk (file://), so the stylesheet, favicon and
// the four modules are inlined; the modules are joined in dependency order into one inline module script with their
// import lines removed and `export` dropped. The build fails if two modules declare the same top-level name.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = name => readFile(path.join(root, name), 'utf8');
const MODULES = ['src/montages.js', 'src/signal.js', 'src/viewer.js', 'src/app.js']; // dependency order

const declared = new Map();
const parts = [];
for (const name of MODULES) {
  let code = await read(name);
  code = code.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"];\s*$/gm, '');
  if (/^\s*import\s/m.test(code)) throw new Error(`${name}: unhandled import`);
  code = code.replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
  if (/^export\s/m.test(code)) throw new Error(`${name}: unhandled export`);
  for (const [, id] of code.matchAll(/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (declared.has(id)) throw new Error(`Top-level name "${id}" is declared in both ${declared.get(id)} and ${name}`);
    declared.set(id, name);
  }
  parts.push(`// ---- ${name}\n${code.trim()}\n`);
}
const script = parts.join('\n').replaceAll('</script', '<\\/script');

const favicon = `data:image/svg+xml;base64,${Buffer.from(await read('src/favicon.svg')).toString('base64')}`;
const css = await read('src/style.css');
let html = await read('index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`index.html no longer contains: ${from}`);
  html = html.replaceAll(from, to);
};
swap('<link rel="stylesheet" href="src/style.css">', `<style>\n${css}</style>`);
swap('href="src/favicon.svg"', `href="${favicon}"`);
swap('src="src/favicon.svg"', `src="${favicon}"`);
swap('<script type="module" src="src/app.js"></script>', `<script type="module">\n${script}</script>`);

await mkdir(path.join(root, 'dist'), {recursive: true});
const out = path.join(root, 'dist', 'ReducedMontageLab.html');
await writeFile(out, html);
console.log(`Wrote ${path.relative(root, out)} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATARS, PET_TYPES } from '../server/store.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(ROOT, '..');
const ASSETS = path.join(PROJECT, 'public', 'assets');

function filesUnder(dir, ext) {
  const out = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!ext || entry.name.toLowerCase().endsWith(ext)) out.push(full);
    }
  }
  walk(dir);
  return out;
}

function assertWellFormedSvg(file) {
  const xml = fs.readFileSync(file, 'utf8');
  assert.match(xml, /^\s*<svg\b/i, `${file}: missing root <svg>`);
  assert.match(xml, /viewBox\s*=\s*['"][^'"]+['"]/i, `${file}: missing viewBox`);
  assert.match(xml, /<\/svg>\s*$/i, `${file}: missing closing </svg>`);

  // Small dependency-free XML well-formedness parser suitable for the generated SVG subset.
  // It validates tag nesting, quoted attributes, comments, CDATA, and XML declaration boundaries.
  const tokens = xml.match(/<!--[\\s\\S]*?-->|<!\[CDATA\[[\\s\\S]*?\]\]>|<[^>]*>/g) || [];
  assert.ok(tokens.length > 0, `${file}: no XML tags found`);
  const stack = [];
  let cursor = 0;
  for (const token of tokens) {
    const at = xml.indexOf(token, cursor);
    assert.ok(at >= cursor, `${file}: invalid XML tokenization`);
    cursor = at + token.length;
    if (token.startsWith('<!--') || token.startsWith('<![CDATA[') || token.startsWith('<?')) continue;
    if (token.startsWith('<!')) throw new Error(`${file}: unsupported/malformed declaration ${token.slice(0, 60)}`);
    if (token.startsWith('</')) {
      const m = token.match(/^<\/([A-Za-z_][\w:.-]*)\s*>$/);
      assert.ok(m, `${file}: malformed closing tag ${token}`);
      assert.equal(stack.pop(), m[1], `${file}: mismatched closing tag ${m[1]}`);
      continue;
    }
    const m = token.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)(\/?)>$/);
    assert.ok(m, `${file}: malformed opening tag ${token.slice(0, 100)}`);
    const [, name, attrs, selfClose] = m;
    // Every attribute must be name="..." or name='...'; this also catches a stray '<' inside a quote.
    const attrRe = /([A-Za-z_:][\w:.-]*)\s*=\s*("(?:[^"<]|&)*"|'(?:[^'<]|&)*')/g;
    let consumed = 0;
    for (const a of attrs.matchAll(attrRe)) {
      const gap = attrs.slice(consumed, a.index);
      assert.ok(/^(?:\s*)$/.test(gap), `${file}: malformed attribute syntax near ${attrs.slice(Math.max(0, a.index - 20), a.index + 60)}`);
      consumed = a.index + a[0].length;
    }
    assert.ok(/^\s*$/.test(attrs.slice(consumed)), `${file}: malformed/unquoted attribute syntax in <${name}>`);
    if (!selfClose) stack.push(name);
  }
  assert.equal(stack.length, 0, `${file}: unclosed XML tag(s): ${stack.join(', ')}`);
  assert.equal((xml.match(/<svg\b/gi) || []).length, 1, `${file}: multiple root SVG tags`);

  const ids = new Set([...xml.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
  for (const m of xml.matchAll(/url\(\s*#([^\)]+)\s*\)/g)) {
    assert.ok(ids.has(m[1]), `${file}: broken internal reference #${m[1]}`);
  }
}

const svgs = filesUnder(ASSETS, '.svg');
assert.ok(svgs.length > 0, 'No SVG assets found');
for (const file of svgs) assert.doesNotThrow(() => assertWellFormedSvg(file), `SVG validation failed: ${file}`);

const referenced = new Set();
function addRef(rel) {
  const normalized = rel.replace(/^\/+/, '').split(/[?#]/)[0];
  if (normalized.startsWith('assets/')) referenced.add(path.join(PROJECT, 'public', normalized));
}
for (const file of filesUnder(path.join(PROJECT, 'public'), null)) {
  if (!/\.(?:js|html|css)$/i.test(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) addRef(m[1]);
  for (const m of text.matchAll(/(["'`])((?:\/)?assets\/[^"'`\s)]+)\1/g)) addRef(m[2]);
}
for (const file of referenced) {
  assert.ok(fs.existsSync(file), `Referenced asset does not exist: ${path.relative(PROJECT, file)}`);
}

const avatarPoses = ['idle','walk','run','wave','high-five','sit','lie','sleep','dance','eat','drink','phone','play','stretch','cheer','clap','laugh','cry','think','surprised','angry','wake','stand','greet'];
for (const avatar of AVATARS) {
  const dir = avatar.id.startsWith('girl') ? 'girls' : 'boys';
  for (const pose of avatarPoses) {
    const file = path.join(ASSETS, 'characters', dir, `${avatar.id}_${pose}.svg`);
    assert.ok(fs.existsSync(file), `Missing avatar pose asset: ${path.relative(PROJECT, file)}`);
  }
}
const petPoses = ['idle','walk','run','sit','lie','sleep','wake','follow','come','stay','play','fetch','eat','drink','happy','sad','curious','scratch','groom','owner','avoid'];
for (const pet of PET_TYPES) {
  for (const pose of petPoses) {
    const file = path.join(ASSETS, 'pets', `${pet}_${pose}.svg`);
    assert.ok(fs.existsSync(file), `Missing pet pose asset: ${path.relative(PROJECT, file)}`);
  }
}

for (const file of filesUnder(ASSETS, '.json')) {
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, 'utf8')), `Invalid JSON asset: ${file}`);
}

console.log(`KIKI asset validation passed: ${svgs.length} SVG files checked; ${referenced.size} explicit asset references resolved.`);

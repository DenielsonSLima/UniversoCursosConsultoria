import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./GestorPortalShell.tsx', import.meta.url), 'utf8');
const root = source.match(/return \(\s*<div className="([^"]+)"/)[1].split(/\s+/);
const mainTag = source.match(/<main\b[\s\S]*?>/)[0];
const main = mainTag.match(/className="([^"]+)"/)[1].split(/\s+/);
const mainBody = source.slice(source.indexOf(mainTag), source.indexOf('</main>'));
const contentTag = mainBody.match(/<div\b[^>]*className="[^"]*\bp-8\b[^"]*"[^>]*>/)[0];
const content = contentTag.match(/className="([^"]+)"/)[1].split(/\s+/);

// Source contracts only: authenticated wheel, focus and modal smoke is still required.
test('portal bounds use the dynamic viewport with a fallback', () => {
  assert.ok(root.includes('h-screen'));
  assert.ok(root.includes('supports-[height:100dvh]:h-dvh'));
  assert.ok(root.includes('overflow-hidden'));
});

test('main owns scrolling and receives the existing navigation reset ref', () => {
  for (const token of ['min-h-0', 'min-w-0', 'flex-1', 'overflow-auto', 'overscroll-contain']) {
    assert.ok(main.includes(token), `main must include ${token}`);
  }
  assert.match(mainTag, /ref=\{contentScrollRef\}/);
  assert.equal((source.match(/ref=\{contentScrollRef\}/g) || []).length, 1);
  assert.match(source, /contentScrollRef: React\.RefObject<HTMLElement \| null>/);
});

test('module content stays in normal flow without a second scroller or clipping', () => {
  assert.ok(content.includes('flex-1'));
  assert.ok(content.includes('min-w-0'));
  assert.ok(!content.some((token) => /^(?:overflow|h-|max-h-|min-h-0)/.test(token)));
  assert.doesNotMatch(contentTag, /ref=\{contentScrollRef\}/);
  assert.match(mainBody, /<Suspense[\s\S]*?\{renderContent\(\)\}[\s\S]*?<\/Suspense>/);
});

test('the portal scroller supports keyboard focus without intercepting wheel or keys', () => {
  assert.match(mainTag, /tabIndex=\{0\}/);
  assert.match(mainTag, /aria-label="Conteúdo do portal"/);
  assert.ok(main.includes('focus-visible:ring-2'));
  assert.ok(main.includes('focus-visible:ring-inset'));
  assert.doesNotMatch(mainTag, /on(?:Wheel|KeyDown|TouchMove)=/);
});

test('header popovers retain their scrollable ancestor and logout stays outside it', () => {
  assert.ok(mainBody.includes('<GestorPortalHeader'));
  assert.ok(!main.includes('overflow-hidden'));
  assert.ok(!main.includes('overflow-clip'));
  assert.ok(source.indexOf('<ConfirmModal') > source.indexOf('</main>'));
});

test('sticky header and focus targets clear the fixed mobile bar', () => {
  const headerSource = readFileSync(new URL('./GestorPortalHeader.tsx', import.meta.url), 'utf8');
  const header = headerSource.match(/<header className="([^"]+)"/)[1].split(/\s+/);
  for (const token of ['sticky', 'top-16', 'lg:top-0', 'min-h-[84px]', 'shrink-0']) {
    assert.ok(header.includes(token), `header must include ${token}`);
  }
  assert.ok(main.includes('pt-16'));
  assert.ok(main.includes('lg:pt-0'));
  assert.ok(main.includes('scroll-pt-[148px]'));
  assert.ok(main.includes('lg:scroll-pt-[84px]'));
});

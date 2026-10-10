import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('deployment manifest contains the full runtime import closure and no fixtures/secrets', () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const bundle = JSON.parse(readFileSync(resolve(root, 'supabase/review-drafts/proesc-v2-growth/EDGE-BUNDLE.json'), 'utf8'));
  assert.equal(bundle.projectRef, 'kfekgwyqozhicpfuunpo');
  assert.equal(bundle.name, 'proesc-v2-copy-archive');
  assert.equal(bundle.verify_jwt, false);
  assert.equal(bundle.newSecretsRequired, false);
  assert.equal(bundle.cleanupEnabled, false);
  const files = new Set(), external = new Set();
  const visit = (path) => {
    if (files.has(path)) return;
    assert.ok(!path.startsWith('../') && !/fixture|test|\.sql$/.test(path));
    files.add(path);
    const source = readFileSync(resolve(root, path), 'utf8');
    for (const [, imported] of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      if (imported.startsWith('.')) visit(relative(root, resolve(root, dirname(path), imported)));
      else external.add(imported);
    }
  };
  visit(bundle.entrypoint_path);
  assert.deepEqual([...files].sort(), bundle.files);
  assert.deepEqual([...external].sort(), bundle.externalImports);
  assert.ok(bundle.externalImports.includes('npm:@supabase/supabase-js@2.95.3'));
  assert.ok(bundle.externalImports.every((name) => name.startsWith('node:') || name === 'npm:@supabase/supabase-js@2.95.3'));
});

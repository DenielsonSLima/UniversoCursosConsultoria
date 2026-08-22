import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const form = readFileSync(
  new URL('./components/UserFormAdd.tsx', import.meta.url),
  'utf8',
);
const list = readFileSync(
  new URL('./components/UsersList.tsx', import.meta.url),
  'utf8',
);

test('formulário bloqueia reentrada imediata e representa o salvamento', () => {
  assert.match(form, /const submitLockedRef = useRef\(false\)/);
  assert.match(form, /if \(isSaving \|\| submitLockedRef\.current\) return/);
  assert.match(
    form,
    /submitLockedRef\.current = true;\s*onSave\(/,
  );
  assert.match(form, /disabled=\{isSaving\}/);
  assert.match(form, /aria-busy=\{isSaving\}/);
  assert.match(form, /isSaving \? 'Salvando\.\.\.'/);
});

test('lista repassa o estado real das mutações ao formulário', () => {
  assert.match(
    list,
    /if \(createUserMutation\.isPending \|\| updateUserMutation\.isPending\) return/,
  );
  assert.match(
    list,
    /isSaving=\{createUserMutation\.isPending \|\| updateUserMutation\.isPending\}/,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('./InstitutionalPasswordSetupWebView.tsx', import.meta.url),
  'utf8',
);

test('convite institucional inválido não oferece recuperação genérica', () => {
  assert.match(
    source,
    /showInviteAssistance = model\.mode === 'request' && model\.isInviteFlow/,
  );
  assert.match(source, /Esta tela não substitui o convite por uma\s+recuperação de senha comum/);
  assert.match(source, /Solicite um novo convite/);
  assert.match(source, /onClick=\{model\.onBackToLogin\}/);
  assert.match(source, /to="\/contato"/);
  assert.match(
    source,
    /showInviteAssistance \? \([\s\S]*?\) : model\.mode === 'request' \? \([\s\S]*?<form onSubmit=\{model\.requestReset\}/,
  );
});

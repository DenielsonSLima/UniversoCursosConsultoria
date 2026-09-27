import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

test('rota do Caixa abre o módulo integrado do Workspace v2', () => {
  const moduleContent = readFileSync(join(
    repoRoot,
    'modules/gestor/components/GestorModuleContent.tsx',
  ), 'utf8');

  assert.match(moduleContent, /import\('\.\.\/caixa\/CaixaWorkspaceModule'\)/);
});

test('cutover mantém modos exclusivos no mesmo polo explícito', () => {
  const source = readFileSync(join(
    repoRoot,
    'modules/gestor/caixa/CaixaWorkspaceModule.tsx',
  ), 'utf8');

  assert.match(source, /const workspacePoloId = poloId/);
  assert.match(source, /<CaixaWorkspaceView/);
  assert.match(source, /<CaixaPage \{\.\.\.props\} isGlobal=\{false\} isMatriz=\{false\}/);
  assert.match(source, /enabled: mode === 'workspace' && Boolean\(poloId\)/);
  assert.match(source, /mode === 'monthly' \? \(/);
  assert.match(source, /Cockpit de tesouraria/);
  assert.match(source, /Análise mensal/);
  assert.doesNotMatch(source, /workspacePoloId\s*=.*'todos'/);
});

test('resolução de empresa usa somente o vínculo protegido do polo', () => {
  const source = readFileSync(join(
    repoRoot,
    'modules/gestor/caixa/workspace/caixa-workspace-scope.service.ts',
  ), 'utf8');

  assert.match(source, /from\('polos'\)/);
  assert.match(source, /select\('id, company_id'\)/);
  assert.match(source, /eq\('company_id', polo\.company_id\)/);
  assert.match(source, /eq\('status', 'ativo'\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|parseFloat|reduce\(/);
});

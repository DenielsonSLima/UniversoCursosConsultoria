import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

test('rota do Caixa volta à análise mensal com navegação por polos', () => {
  const moduleContent = readFileSync(join(
    repoRoot,
    'modules/gestor/components/GestorModuleContent.tsx',
  ), 'utf8');

  assert.match(moduleContent, /import\('\.\.\/caixa\/CaixaPage'\)/);
});

test('workspace de tesouraria ocupa o Resumo financeiro no polo explícito', () => {
  const pageSource = readFileSync(join(
    repoRoot,
    'modules/gestor/financeiro/FinanceiroPage.tsx',
  ), 'utf8');
  const summarySource = readFileSync(join(
    repoRoot,
    'modules/gestor/financeiro/resumo/FinanceiroResumoTab.tsx',
  ), 'utf8');

  assert.match(pageSource, /<FinanceiroResumoTab/);
  assert.match(summarySource, /<CaixaWorkspaceView/);
  assert.match(summarySource, /poloId=\{selectedPoloId\}/);
  assert.match(summarySource, /availableTabs\.includes\('despesas'\)/);
  assert.doesNotMatch(summarySource, /reduce\(|parseFloat|Number\(/);
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

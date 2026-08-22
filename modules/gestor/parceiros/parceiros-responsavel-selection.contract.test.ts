import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  selectionSource,
  pageSource,
  responsaveisTabSource,
  formHostSource,
  dashboardPresentationSource,
  dashboardModalSource,
  moduleContentSource,
  loginSource,
] = await Promise.all([
  readFile(new URL('./components/ParceiroSelectionModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./ParceirosPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./responsaveis/ResponsaveisTab.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./components/ParceiroFormHost.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard/dashboard.presentation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard/components/DashboardQuickActionsModal.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/GestorModuleContent.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../login/LoginPage.tsx', import.meta.url), 'utf8'),
]);

test('Novo Registro oferece Responsável e o encaminha para o fluxo governado existente', () => {
  assert.match(selectionSource, /onSelect\('responsavel'\)/);
  assert.match(pageSource, /if \(form === 'responsavel'\)/);
  assert.match(pageSource, /setActiveTab\('responsaveis'\)/);
  assert.match(pageSource, /setOpenResponsavelCreate\(true\)/);
  assert.match(pageSource, /openCreateOnMount=\{openResponsavelCreate\}/);
});

test('pedido de abertura usa o formulário canônico e não amplia o host genérico', () => {
  assert.match(
    responsaveisTabSource,
    /if \(!openCreateOnMount \|\| !queryScope \|\| !listQuery\.isSuccess\) return;/,
  );
  assert.match(responsaveisTabSource, /if \(listAccess\?\.canCreate === true\)/);
  assert.match(responsaveisTabSource, /actions\.creation\.setVisible\(true\)/);
  assert.match(responsaveisTabSource, /toast\.info\([\s\S]*Cadastro não autorizado/);
  assert.match(responsaveisTabSource, /onCreateOpenHandled\?\.\(\)/);
  assert.doesNotMatch(formHostSource, /case 'responsavel'/);
});

test('Dashboard e deep-link preservam a entrada Responsável até ParceirosPage', () => {
  assert.match(dashboardPresentationSource, /DashboardPartnerForm = [^;]*'responsavel'/);
  assert.match(dashboardModalSource, /id: 'responsavel'/);
  assert.match(moduleContentSource, /\['aluno', 'professor', 'responsavel', 'pf', 'pj'\]/);
  assert.match(pageSource, /initialForm === 'responsavel' \? 'responsaveis' : activeTabInicial/);
  assert.match(pageSource, /setOpenResponsavelCreate\(true\)/);
});

test('recuperação institucional mantém a origem ao sair do login', () => {
  assert.match(
    loginSource,
    /forgotPasswordHref="\/recuperar-senha\?source=institucional"/,
  );
});

test('card de Responsável respeita o escopo de criação e explica o bloqueio', () => {
  assert.match(selectionSource, /aria-disabled=\{!canCreateResponsavel\}/);
  assert.match(selectionSource, /responsavelUnavailableReason/);
  assert.match(pageSource, /if \(!includeGlobal\)/);
  assert.match(pageSource, /toast\.info\('Cadastro indisponível'/);
  assert.match(pageSource, /canCreateResponsavel=\{includeGlobal\}/);
});

test('seletor é um diálogo navegável e rolável em telas baixas', () => {
  assert.match(selectionSource, /role="dialog"/);
  assert.match(selectionSource, /aria-modal="true"/);
  assert.match(selectionSource, /aria-labelledby="parceiro-selection-title"/);
  assert.match(selectionSource, /event\.key === 'Escape'/);
  assert.match(selectionSource, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(selectionSource, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(selectionSource, /overflow-y-auto/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');

const [
  turmaAlunosSource,
  academicModalSource,
  financialModalSource,
  confirmationSource,
  turmaTecnicoDetalhesSource,
] =
  await Promise.all([
    read('../TurmaAlunos.tsx'),
    read('./ConfirmarVinculoAcademicoModal.tsx'),
    read('./ConfirmarMatriculaModal.tsx'),
    read('./useTechnicalEnrollmentConfirmation.ts'),
    read('../../TurmaTecnicoDetalhes.tsx'),
  ]);

const extractBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Contrato ausente: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Fim do contrato ausente: ${end}`);
  return source.slice(startIndex, endIndex);
};

test('separa o wizard financeiro da confirmação acadêmica por permissão', () => {
  const financialBranch = extractBetween(
    turmaAlunosSource,
    '{pendingEnrollment && requireTechnicalProfile && canManageFinanceiro',
    '{pendingEnrollment && requireTechnicalProfile && !canManageFinanceiro',
  );
  const academicBranch = extractBetween(
    turmaAlunosSource,
    '{pendingEnrollment && requireTechnicalProfile && !canManageFinanceiro',
    '{pendingEnrollment && !requireTechnicalProfile',
  );

  assert.match(financialBranch, /<ConfirmarMatriculaModal\b/);
  assert.doesNotMatch(financialBranch, /<ConfirmarVinculoAcademicoModal\b/);
  assert.match(academicBranch, /<ConfirmarVinculoAcademicoModal\b/);
  assert.doesNotMatch(academicBranch, /<ConfirmarMatriculaModal\b/);
});

test('deriva o fluxo restrito da permissão explícita da aba Financeiro', () => {
  assert.match(
    turmaTecnicoDetalhesSource,
    /const canViewFinanceiro = canAccessGestaoTurmaTab\(permissions, ['"]financeiro['"]\)/,
  );
  assert.match(
    turmaTecnicoDetalhesSource,
    /<TurmaAlunos turma=\{turma\} canManageFinanceiro=\{canViewFinanceiro\} \/>/,
  );
  assert.match(
    turmaAlunosSource,
    /requireTechnicalProfile && !canManageFinanceiro && canEnroll/,
  );
});

test('perfil sem Financeiro confirma somente vínculo com payload pendente e neutro', () => {
  const submission = extractBetween(
    turmaAlunosSource,
    'const ACADEMIC_ONLY_ENROLLMENT_SUBMISSION',
    '};',
  );

  assert.match(submission, /intent:\s*['"]PENDENTE['"]/);
  assert.match(submission, /primeiroVencimento:\s*['"]['"]/);
  assert.match(submission, /ativarEm:\s*['"]['"]/);
  assert.match(submission, /override:\s*null/);
  assert.match(submission, /codigoAutorizacao:\s*null/);
  assert.match(submission, /motivo:\s*null/);
  assert.match(submission, /justificativa:\s*null/);

  const academicBranch = extractBetween(
    turmaAlunosSource,
    '{pendingEnrollment && requireTechnicalProfile && !canManageFinanceiro',
    '{pendingEnrollment && !requireTechnicalProfile',
  );
  assert.match(
    academicBranch,
    /confirmEnrollmentFinance\(ACADEMIC_ONLY_ENROLLMENT_SUBMISSION\)/,
  );

  assert.match(
    confirmationSource,
    /const effectiveIntent = manualFinanceMode\s*\?\s*['"]PENDENTE['"][\s\S]*?canManageFinanceiro\s*\?\s*submission\.intent\s*:\s*['"]PENDENTE['"]/,
  );
  assert.match(
    confirmationSource,
    /primeiroVencimento:\s*canManageFinanceiro\s*\?\s*primeiroVencimento\s*\|\|\s*null\s*:\s*null/,
  );
});

test('modal acadêmico bloqueia confirmação até o contexto mínimo estar pronto', () => {
  for (const prop of ['loading', 'error', 'retrying', 'ready', 'onRetry']) {
    assert.match(academicModalSource, new RegExp(`\\b${prop}\\b`));
  }

  const blockedDeclaration = academicModalSource.match(
    /const\s+(\w+)\s*=\s*([^;]*!ready[^;]*);/,
  );
  assert.ok(blockedDeclaration, 'a confirmação deve ser bloqueada em todo estado não pronto');
  for (const state of ['pending', 'loading', 'error', 'retrying']) {
    assert.match(blockedDeclaration[2], new RegExp(`\\b${state}\\b`));
  }
  assert.match(
    academicModalSource,
    new RegExp(`disabled=\\{${blockedDeclaration[1]}\\}`),
  );
  assert.match(academicModalSource, /onClick=\{onRetry\}/);
  assert.match(academicModalSource, /disabled=\{retrying\}/);

  const academicBranch = extractBetween(
    turmaAlunosSource,
    '{pendingEnrollment && requireTechnicalProfile && !canManageFinanceiro',
    '{pendingEnrollment && !requireTechnicalProfile',
  );
  assert.match(academicBranch, /loading=\{preVinculoContextoQuery\.isLoading\}/);
  assert.match(academicBranch, /error=\{preVinculoContextoQuery\.isError\}/);
  assert.match(academicBranch, /retrying=\{preVinculoContextoQuery\.isFetching\}/);
  assert.match(academicBranch, /ready=\{Boolean\(preVinculoContextoQuery\.data\?\.regra\)\}/);
  assert.match(academicBranch, /preVinculoContextoQuery\.refetch\(\)/);
});

test('modal acadêmico simples não expõe valores nem controles financeiros', () => {
  const forbiddenFinancialUi = [
    /formatMoney/,
    /R\$/,
    /valorMatricula/,
    /valorMensalidade/,
    /primeiroVencimento/,
    /ativarEm/,
    /desconto/i,
    /juros/i,
    /multa/i,
    /condição individual/i,
  ];

  for (const forbidden of forbiddenFinancialUi) {
    assert.doesNotMatch(academicModalSource, forbidden);
  }

  assert.match(academicModalSource, /Confirmar vínculo/);
  assert.match(
    academicModalSource,
    /Nenhuma cobrança será criada neste fluxo/,
  );
  assert.match(financialModalSource, /const STEPS = \[/);
  assert.match(financialModalSource, /Condição individual/);
  assert.match(financialModalSource, /Simulação e vencimento/);
});

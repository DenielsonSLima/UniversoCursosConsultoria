import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../../../../../../', import.meta.url));
const { outputFiles } = await build({
  stdin: {
    contents: `
      export { default as Header } from './modules/gestor/gestao/tecnicos/detalhes/components/alunos/TurmaAlunosHeader';
      export { default as EnrollmentModal } from './modules/gestor/parceiros/components/EnrollmentModal';
      export { default as PartnerModals } from './modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoMatriculasModals';
      export { useTechnicalAdmission } from './modules/gestor/gestao/tecnicos/detalhes/hooks/useTechnicalAdmission';
      export { technicalAdmissionUiState } from './modules/shared/utils/technicalAdmissionPolicy';
      export { academicLifecycleKeys } from './modules/gestor/gestao/tecnicos/detalhes/academic-lifecycle.keys';
      export { QueryClient, QueryClientProvider, IsRestoringProvider } from '@tanstack/react-query';
      export { createElement as element } from 'react';
      export { renderToStaticMarkup as render } from 'react-dom/server';
    `,
    resolveDir: root,
  },
  plugins: [{ name: 'isolated-admission-rpc', setup(context) {
    context.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'test-rpc' }));
    context.onLoad({ filter: /.*/, namespace: 'test-rpc' }, () => ({
      contents: 'export const supabase = { rpc: (...args) => globalThis.__admissionTestRpc(...args) };',
    }));
  } }],
  bundle: true, write: false, format: 'cjs', platform: 'node', target: 'es2022',
});
const compiled = { exports: {} };
new Function('module', 'exports', 'require', outputFiles[0].text)(
  compiled, compiled.exports, createRequire(import.meta.url),
);
const { Header, EnrollmentModal, PartnerModals, useTechnicalAdmission,
  technicalAdmissionUiState, academicLifecycleKeys, QueryClient, QueryClientProvider, IsRestoringProvider,
  element, render } = compiled.exports;
const turmaId = '00000000-0000-0000-0000-000000000001';
const allowedPolicy = {
  versao: 1, turmaId, dataReferencia: '2026-10-10', dataInicio: '2025-10-10',
  dataLimiteMatriculaDireta: '2026-10-10', diasDesdeInicio: 365,
  matriculaDiretaPermitida: true, transferenciaObrigatoria: false,
  motivo: 'PERMITIDA', mensagem: 'Matrícula direta permitida até 10/10/2026.',
};
const expiredPolicy = { ...allowedPolicy, dataReferencia: '2026-10-11', diasDesdeInicio: 366,
  matriculaDiretaPermitida: false, transferenciaObrigatoria: true,
  motivo: 'PRAZO_EXPIRADO', mensagem: 'Esta turma aceita novos alunos somente por transferência.',
};
const ui = (policy) => technicalAdmissionUiState({ required: true, phaseAllowed: true,
  policy, pending: false, fetching: false, error: false,
});
const queryClient = (policy) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  client.setQueryData([...academicLifecycleKeys.turma(turmaId), 'ingresso-direto'], policy);
  return client;
};
// O SSR representa o snapshot confirmado; efeitos de montagem não são executados aqui.
const withClient = (client, child) => render(element(QueryClientProvider, { client },
  element(IsRestoringProvider, { value: true }, child),
));
const noop = () => {};

test('Header mantém registros existentes e oferece transferência com motivo e matrícula desabilitada', () => {
  const html = render(element(Header, { totalStudents: 24, onEnroll: noop, canEnroll: false,
    admission: ui(expiredPolicy), onReceiveTransfer: noop,
  }));
  assert.match(html, /24 registros preservados/);
  assert.match(html, /somente por transferência/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*?Matricular Aluno/);
  assert.match(html, /Receber transferência<\/button>/);
  const allowed = render(element(Header, { totalStudents: 24, onEnroll: noop, canEnroll: true,
    admission: ui(allowedPolicy),
  }));
  assert.match(allowed, /Matrícula direta até 10\/10\/2026/);
  assert.doesNotMatch(allowed, /disabled=""/);
});

test('seleção após cadastro e confirmação do cadastro do aluno exibem o mesmo bloqueio canônico', () => {
  const client = queryClient(expiredPolicy);
  const turma = { id: turmaId, nome: 'Turma de teste', modalidade: 'TECNICO' };
  const html = withClient(client, element(EnrollmentModal, { alunoNome: 'Aluno sintético',
    alunoId: 'aluno-sintetico', turmas: [turma], selectedTurmaId: turmaId,
    isPending: false, onClose: noop, onSelectTurma: noop, onConfirm: noop,
  }));
  assert.match(html, /somente por transferência/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Confirmar Matrícula<\/button>/);
  const partner = render(element(PartnerModals, { open: true, classId: turmaId,
    classes: [{ ...turma, cursos: { modalidade: 'TECNICO' } }], pendingClass: null,
    mutation: { isPending: false }, availablePaymentMethods: [], selected: null,
    admission: ui(expiredPolicy),
  }));
  assert.match(partner, /somente por transferência/);
  assert.match(partner, /<button[^>]*disabled=""[^>]*>[\s\S]*?Confirmar matrícula/);
  client.clear();
});

test('confirmação renova a política e rejeita prazo que mudou depois da seleção', async () => {
  const client = queryClient(allowedPolicy);
  const calls = [];
  globalThis.__admissionTestRpc = async (name, args) => {
    calls.push({ name, args });
    return { data: expiredPolicy, error: null };
  };
  let admission;
  const Capture = () => { admission = useTechnicalAdmission(turmaId, true); return null; };
  withClient(client, element(Capture));
  assert.equal(admission.admission.allowed, true);
  await assert.rejects(admission.requireAllowed(), /somente por transferência/);
  assert.deepEqual(calls, [{ name: 'get_turma_tecnica_ingresso_secure', args: { p_turma_id: turmaId } }]);
  client.clear();
  delete globalThis.__admissionTestRpc;
});

test('outra modalidade não consulta política técnica ao confirmar', async () => {
  const client = new QueryClient();
  let admission;
  const Capture = () => { admission = useTechnicalAdmission(turmaId, false); return null; };
  globalThis.__admissionTestRpc = async () => { throw new Error('consulta proibida'); };
  withClient(client, element(Capture));
  assert.equal(admission.admission.allowed, true);
  await admission.requireAllowed();
  client.clear();
  delete globalThis.__admissionTestRpc;
});

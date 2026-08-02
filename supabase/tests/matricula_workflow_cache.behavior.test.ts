import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { academicLifecycleKeys } from '../../modules/gestor/gestao/tecnicos/detalhes/academic-lifecycle.keys.ts';
import {
  reconcileMatriculaTecnicaWorkflowCache,
} from '../../modules/gestor/parceiros/components/viewparceiros/aluno/matricula-tecnica-workflow-cache.ts';
import type {
  MatriculaTecnicaPendenteDocumento,
} from '../../modules/gestor/parceiros/documentos-aluno.service.ts';
import {
  matriculaTecnicaWorkflowKeys,
} from '../../modules/shared/documentos-aluno/documentos-aluno.query-keys.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const alunoId = '00000000-0000-4000-8000-000000000001';
const matriculaId = '00000000-0000-4000-8000-000000000002';
const turmaId = '00000000-0000-4000-8000-000000000003';

const snapshot: MatriculaTecnicaPendenteDocumento = {
  matriculaId,
  alunoId,
  turmaId,
  turmaNome: 'Técnico 01',
  cursoNome: 'Técnico em Enfermagem',
  status: 'PENDENTE',
  turmaStatus: 'EM_ANDAMENTO',
  fluxo: 'IMPLANTACAO',
  pagamento: { estado: 'NAO_APLICAVEL' },
  documentacao: {
    concluida: false,
    obrigatoriosTotal: 7,
    concluidos: 2,
    pendentes: 5,
    dadosPessoaisPendentes: false,
    envioEmAndamento: false,
  },
  liberacaoAcademica: {
    id: '00000000-0000-4000-8000-000000000004',
    ativa: true,
    liberadoEm: '2026-07-31T04:00:00.000Z',
    liberadoPorNome: 'Gestor',
    motivo: 'Aluno validado para a implantação.',
  },
  acoes: {
    ativarRegular: {
      permitida: false,
      bloqueios: ['FLUXO_NAO_REGULAR'],
    },
    liberarImplantacao: {
      permitida: false,
      bloqueios: ['LIBERACAO_JA_ATIVA'],
    },
    revogarLiberacao: {
      permitida: true,
      bloqueios: [],
    },
  },
};

Deno.test('snapshot canônico substitui cache e invalida todos os consumidores', async () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const workflowKey = matriculaTecnicaWorkflowKeys.aluno(alunoId);
  const consumerKeys = [
    ['parceiro', alunoId, 'matriculas'],
    ['parceiro', alunoId, 'matricula-atual'],
    ['matriculas', alunoId],
    ['diario-alunos', turmaId],
    ['diario-notas-resultados', turmaId],
    academicLifecycleKeys.turma(turmaId),
  ] as const;

  queryClient.setQueryData(workflowKey, [{
    ...snapshot,
    fluxo: 'REGULAR',
    liberacaoAcademica: null,
  }]);
  consumerKeys.forEach((queryKey) => {
    queryClient.setQueryData(queryKey, { stale: false });
  });

  await reconcileMatriculaTecnicaWorkflowCache(
    queryClient,
    alunoId,
    snapshot,
  );

  const workflows = queryClient.getQueryData<
    MatriculaTecnicaPendenteDocumento[]
  >(workflowKey);
  assert.equal(workflows?.length, 1);
  assert.equal(workflows?.[0]?.fluxo, 'IMPLANTACAO');
  assert.equal(workflows?.[0]?.liberacaoAcademica?.ativa, true);

  for (const queryKey of [workflowKey, ...consumerKeys]) {
    assert.equal(
      queryClient.getQueryState(queryKey)?.isInvalidated,
      true,
      `A chave ${JSON.stringify(queryKey)} deveria estar invalidada.`,
    );
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mapRelatorioAlunosAcademicos } from './relatorio-alunos-academicos.contract.ts';

const payload = {
  meta: {
    modo: 'SITUACAO_ALUNO',
    escopo: 'Matriz',
    generated_at: '2026-08-26T23:10:00+00:00',
  },
  filtros_aplicados: {
    polo_id: 'polo-1',
    modalidade: 'TECNICO',
    turma_id: null,
    status: null,
    busca: null,
  },
  resumo: {
    total_registros: 27,
    total_ativos: 0,
    total_concluidos: 0,
    total_pendentes: 25,
    total_tecnico: 27,
    total_ead: 0,
    total_certificados_finalizados: 0,
    por_status: [
      { status: 'PENDENTE', quantidade: 25 },
      { status: 'DESISTENTE', quantidade: 2 },
    ],
    por_modalidade: [{ modalidade: 'TECNICO', quantidade: 27 }],
  },
  turmas_disponiveis: [{
    id: 'turma-1',
    nome: 'Técnico em Radiologia - Integral',
    codigo: '2026.1-RAD-INT-JAP',
    modalidade: 'TECNICO',
  }],
  linhas: [{
    id: 'matricula-1',
    aluno_id: 'aluno-1',
    aluno_nome: 'Aluno Pendente',
    aluno_cpf_mascarado: '***.493.375-**',
    data_nascimento: null,
    pcd: false,
    pcd_tipo: null,
    status: 'PENDENTE',
    data_matricula: '2026-08-26',
    curso_nome: 'Técnico em Radiologia',
    modalidade: 'TECNICO',
    carga_horaria: 1600,
    turma_id: 'turma-1',
    turma_nome: 'Técnico em Radiologia - Integral',
    turma_codigo: '2026.1-RAD-INT-JAP',
    turma_status: 'EM_ANDAMENTO',
    data_inicio: '2026-06-01',
    data_fim: '2028-06-01',
    polo_nome: 'Matriz',
    certificado_status: null,
  }],
  page_info: {
    offset: 0,
    limit: 500,
    returned: 1,
    total: 27,
    has_more: true,
  },
  empty_reason: null,
};

test('mapper preserva PENDENTE separado de ATIVO e usa CPF já mascarado pelo backend', () => {
  const result = mapRelatorioAlunosAcademicos(payload);

  assert.equal(result.resumo.totalRegistros, 27);
  assert.equal(result.resumo.totalAtivos, 0);
  assert.equal(result.resumo.totalPendentes, 25);
  assert.equal(result.linhas[0].status, 'PENDENTE');
  assert.equal(result.linhas[0].alunoCpfMascarado, '***.493.375-**');
  assert.equal(result.turmasDisponiveis[0].codigo, '2026.1-RAD-INT-JAP');
});

test('mapper rejeita CPF completo e contrato incompleto', () => {
  const unsafe = JSON.parse(JSON.stringify(payload)) as typeof payload;
  unsafe.linhas[0].aluno_cpf_mascarado = '086.493.375-46';

  assert.throws(
    () => mapRelatorioAlunosAcademicos(unsafe),
    /CPF sem mascaramento canônico/i,
  );
  assert.throws(
    () => mapRelatorioAlunosAcademicos({ meta: {}, linhas: [] }),
    /contrato incompleto/i,
  );
});

test('mapper rejeita números nulos e paginação implícita ou divergente', () => {
  const nullCount = JSON.parse(JSON.stringify(payload));
  nullCount.resumo.total_ativos = null;
  const missingHasMore = JSON.parse(JSON.stringify(payload));
  delete missingHasMore.page_info.has_more;
  const divergentPage = JSON.parse(JSON.stringify(payload));
  divergentPage.page_info.returned = 2;

  assert.throws(() => mapRelatorioAlunosAcademicos(nullCount), /total_ativos inválido/i);
  assert.throws(() => mapRelatorioAlunosAcademicos(missingHasMore), /paginação incompleto/i);
  assert.throws(() => mapRelatorioAlunosAcademicos(divergentPage), /paginação divergente/i);
});

test('mapper rejeita agregações repetidas, linhas divergentes e dados excessivos', () => {
  const duplicateStatus = JSON.parse(JSON.stringify(payload));
  duplicateStatus.resumo.por_status = [
    ...duplicateStatus.resumo.por_status,
    { status: 'DESISTENTE', quantidade: 0 },
  ];
  const divergentRow = JSON.parse(JSON.stringify(payload));
  divergentRow.linhas[0].status = 'ATIVO';
  const excessiveData = JSON.parse(JSON.stringify(payload));
  excessiveData.linhas[0].data_nascimento = '2000-01-10';
  const outsideAppliedStatus = JSON.parse(JSON.stringify(payload));
  outsideAppliedStatus.filtros_aplicados.status = 'DESISTENTE';

  assert.throws(() => mapRelatorioAlunosAcademicos(duplicateStatus), /categorias agregadas repetidas/i);
  assert.throws(() => mapRelatorioAlunosAcademicos(divergentRow), /linhas divergentes/i);
  assert.throws(() => mapRelatorioAlunosAcademicos(excessiveData), /dados cadastrais excessivos/i);
  assert.throws(() => mapRelatorioAlunosAcademicos(outsideAppliedStatus), /fora dos filtros aplicados/i);
});

test('tela acadêmica não consulta tabelas nem calcula classificação, totais ou paginação', async () => {
  const source = await readFile(
    new URL('../components/RelatorioAlunosAcademicos.tsx', import.meta.url),
    'utf8',
  );
  const service = await readFile(
    new URL('./relatorio-alunos-academicos.service.ts', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(source, /supabase|\.from\(|\.filter\(|\.reduce\(|\.sort\(|paginateReportItems/);
  assert.doesNotMatch(source, /window\.print|A4ReportPrintStyles|ReportFilterPanel|showFullCpf|maskCpf/);
  assert.doesNotMatch(source, /placeholderData/);
  assert.match(source, /reportQuery\.isFetching/);
  assert.match(source, /turmaSelection\.scopeKey === scopeKey/);
  assert.match(source, /report\.resumo\.totalAtivos/);
  assert.match(source, /report\.resumo\.totalPendentes/);
  assert.match(source, /<FinancialReportExportButton/);
  assert.match(source, /<DocumentHeader/);
  assert.match(source, /<ReportWatermark/);
  assert.match(service, /\.rpc\('get_relatorio_alunos_academicos_secure'/);
  assert.match(service, /dados de uma solicitação diferente da atual/);
});

test('os três wrappers preservam a API pública e o modo correto', async () => {
  const [cursando, finalizados, situacao] = await Promise.all([
    readFile(new URL('../components/RelatorioAlunosCursando.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/RelatorioAlunosFinalizados.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/RelatorioSituacaoAluno.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(cursando, /modo="cursando"/);
  assert.match(finalizados, /modo="finalizados"/);
  assert.match(situacao, /modo="situacao-aluno"/);
});

test('migration aplica RBAC, classificação, filtros, KPIs, ordem e mascaramento no backend', async () => {
  const migration = await readFile(
    new URL(
      '../../../../supabase/migrations/20260826231000_create_secure_academic_students_report.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /public\.is_gestor_for_polo\(p_polo_id\)/);
  assert.match(migration, /public\.gestor_has_module\('relatorios'\)/);
  assert.match(migration, /IF v_modo = 'CURSANDO' THEN\s+v_status := 'ATIVO'/);
  assert.match(migration, /ELSIF v_modo = 'FINALIZADOS' THEN\s+v_status := 'CONCLUIDO'/);
  assert.match(migration, /'PENDENTE', 'ATIVO'/);
  assert.match(migration, /aluno_cpf_mascarado/);
  assert.match(migration, /WHEN v_modo = 'MATRICULA_INICIAL' THEN to_char\(item\.data_nascimento/);
  assert.doesNotMatch(migration, /certificado_codigo|codigo_validacao|data_conclusao/);
  assert.match(migration, /row_number\(\) OVER/);
  assert.match(migration, /'turmas_disponiveis', v_turmas/);
  assert.match(migration, /'total_pendentes', v_total_pendentes/);
  assert.match(migration, /'empty_reason', v_empty_reason/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION/);
});

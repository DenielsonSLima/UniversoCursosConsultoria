import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mapRelatorioTurmas } from './relatorio-turmas.contract.ts';

const payload = {
  meta: {
    escopo: 'Matriz',
    generated_at: '2026-08-26T22:00:00+00:00',
  },
  filtros_aplicados: {
    polo_id: 'polo-1',
    modalidade: 'TECNICO',
    status: 'EM_ANDAMENTO',
    busca: null,
  },
  resumo: {
    total_turmas: 9,
    total_alunos_ativos: 0,
    por_status: [{
      status: 'EM_ANDAMENTO',
      quantidade_turmas: 9,
      quantidade_alunos_ativos: 0,
    }],
  },
  linhas: [{
    id: 'turma-1',
    codigo: '2026.1-RAD-INT-JAP',
    nome: 'Técnico em Radiologia - Integral',
    status: 'EM_ANDAMENTO',
    turno: 'INTEGRAL',
    data_inicio: '2026-06-01',
    data_previsao_termino: '2028-06-01',
    curso_nome: 'Técnico em Radiologia',
    modalidade: 'TECNICO',
    polo_nome: 'Matriz',
    alunos_ativos: 0,
  }],
  page_info: {
    offset: 0,
    limit: 1,
    returned: 1,
    total: 9,
    has_more: true,
  },
  empty_reason: null,
};

test('mapper preserva os totais e a classificação devolvidos pelo backend', () => {
  const result = mapRelatorioTurmas(payload);

  assert.equal(result.resumo.totalTurmas, 9);
  assert.equal(result.resumo.totalAlunosAtivos, 0);
  assert.equal(result.linhas.length, 1);
  assert.equal(result.linhas[0].status, 'EM_ANDAMENTO');
  assert.equal(result.linhas[0].dataPrevisaoTermino, '2028-06-01');
  assert.equal(result.pageInfo.total, 9);
});

test('mapper rejeita contrato incompleto em vez de produzir lista vazia', () => {
  assert.throws(
    () => mapRelatorioTurmas({ meta: {}, linhas: [] }),
    /contrato incompleto/i,
  );
});

test('mapper rejeita totais nulos e paginação inconsistente', () => {
  assert.throws(
    () => mapRelatorioTurmas({
      ...payload,
      resumo: { ...payload.resumo, total_turmas: null },
    }),
    /total_turmas inválido/i,
  );
  assert.throws(
    () => mapRelatorioTurmas({
      ...payload,
      page_info: { ...payload.page_info, has_more: false },
    }),
    /paginação inconsistentes/i,
  );
});

test('tela de turmas não consulta tabelas, calcula totais nem chama impressão nativa', async () => {
  const source = await readFile(
    new URL('../components/RelatorioTurmas.tsx', import.meta.url),
    'utf8',
  );
  const service = await readFile(new URL('./relatorio-turmas.service.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /supabase|\.from\(|\.reduce\(|window\.print|A4ReportPrintStyles/);
  assert.match(source, /report\.resumo\.totalTurmas/);
  assert.match(source, /report\.resumo\.totalAlunosAtivos/);
  assert.match(source, /<FinancialReportExportButton/);
  assert.match(service, /\.rpc\('get_relatorio_turmas_secure'/);
});

test('migration usa ciclo acadêmico canônico, RBAC e agregação no backend', async () => {
  const migration = await readFile(
    new URL(
      '../../../../supabase/migrations/20260826230000_create_secure_classes_report.sql',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(migration, /data_previsao_termino/);
  assert.doesNotMatch(migration, /turma\.data_fim\b/);
  assert.match(migration, /public\.is_gestor_for_polo\(p_polo_id\)/);
  assert.match(migration, /public\.gestor_has_module\('relatorios'\)/);
  assert.match(migration, /upper\(coalesce\(matricula\.status, ''\)\) = 'ATIVO'/);
  assert.match(migration, /'PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO', 'FINALIZADA'/);
  assert.match(migration, /'total_turmas', v_total_turmas/);
  assert.match(migration, /'total_alunos_ativos', v_total_alunos_ativos/);
  assert.match(migration, /'empty_reason', v_empty_reason/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
});

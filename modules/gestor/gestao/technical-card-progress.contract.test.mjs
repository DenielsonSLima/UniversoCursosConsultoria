import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const [mapper, card, technicalPage, paginatedHook] = await Promise.all([
  readFile(new URL('./gestao.mappers.ts', import.meta.url), 'utf8'),
  readFile(new URL('./components/TurmaCard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./tecnicos/GestaoTecnicos.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./hooks/useTurmasPaginadas.ts', import.meta.url), 'utf8'),
]);

const enrichment = mapper.slice(mapper.indexOf('export const enrichTechnicalAcademicProgress'));

let rpcImplementation = async () => ({ data: [], error: null });
globalThis.__technicalCardSupabase = {
  rpc: (...args) => rpcImplementation(...args),
};
const executableMapper = mapper
  .replace("import { supabase } from '../../../lib/supabase';", 'const supabase = globalThis.__technicalCardSupabase;')
  .replace("import { Turma } from './gestao.types';", '');
const transpiledMapper = ts.transpileModule(executableMapper, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { enrichTechnicalAcademicProgress } = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledMapper).toString('base64')}`
);

const makeTurma = (id) => ({ id });
const makeProgressRow = (turmaId) => ({
  turma_id: turmaId,
  total_disciplinas: 3,
  disciplinas_concluidas: 1,
  grade_concluida: false,
  modulo_atual_id: null,
  modulo_atual_nome: null,
  modulo_atual_ordem: null,
  disciplina_atual_id: null,
  disciplina_atual_nome: null,
  disciplina_atual_ordem: null,
  professor_atual: null,
  carga_horaria: null,
  horas_realizadas: null,
  proxima_aula_data: null,
  proxima_aula_titulo: null,
});

test('card técnico consome somente a RPC acadêmica canônica', () => {
  const rpcCalls = enrichment.match(/supabase\.rpc\(/g) || [];
  assert.equal(rpcCalls.length, 1);
  assert.match(enrichment, /get_gestao_turmas_academic_progress/);
  assert.doesNotMatch(enrichment, /get_gestao_turmas_completion_counts/);
  assert.match(enrichment, /ACADEMIC_PROGRESS_BATCH_SIZE/);
  assert.match(enrichment, /readCanonicalAcademicCount\([\s\S]*?progress\.total_disciplinas/);
  assert.match(enrichment, /readCanonicalAcademicCount\([\s\S]*?progress\.disciplinas_concluidas/);
  assert.match(enrichment, /typeof progress\.grade_concluida !== 'boolean'/);
  assert.doesNotMatch(enrichment, /progress\.(?:total_disciplinas|disciplinas_concluidas) \|\| 0/);
  assert.match(enrichment, /disciplinaAtualId: hasCurrentDiscipline \? progress\.disciplina_atual_id/);
});

test('card apenas apresenta concluídas/total com contexto acessível', () => {
  assert.match(card, /`\$\{disciplinasConcluidas\}\/\$\{totalDisciplinas\}`/);
  assert.match(card, /aria-label=\{progressoDisciplinasLabel\}/);
  assert.doesNotMatch(card, /(?:disciplinasConcluidas|totalDisciplinas) \?\? 0/);
  assert.doesNotMatch(card, /disciplinasConcluidas\s*[+*%-]/);
});

test('falha do retrato acadêmico não se transforma em lista vazia e oferece retry', () => {
  assert.match(enrichment, /if \(response\.error\)[\s\S]*?throw response\.error/);
  assert.match(enrichment, /Progresso acadêmico indisponível/);
  assert.match(paginatedHook, /error: query\.error instanceof Error \? query\.error : null/);
  assert.match(paginatedHook, /query\.refetch\(\{ throwOnError: true \}\)/);
  assert.match(technicalPage, /list\.error \? \([\s\S]*?<TechnicalDataError/);
  assert.match(technicalPage, /onRetry=\{\(\) => \{ void list\.reload\(\)/);
});

test('transporte particiona 201 IDs sem calcular a semântica acadêmica no frontend', async () => {
  const ids = Array.from({ length: 201 }, (_, index) => `turma-${index + 1}`);
  const requestedBatches = [];
  rpcImplementation = async (rpcName, args) => {
    await Promise.resolve();
    assert.equal(rpcName, 'get_gestao_turmas_academic_progress');
    requestedBatches.push(args.p_turma_ids);
    return {
      data: args.p_turma_ids.map(makeProgressRow),
      error: null,
    };
  };

  const result = await enrichTechnicalAcademicProgress(ids.map(makeTurma));

  assert.deepEqual(requestedBatches.map((batch) => batch.length), [200, 1]);
  assert.deepEqual(requestedBatches.flat(), ids);
  assert.deepEqual(result.map((turma) => turma.id), ids);
  assert.ok(result.every((turma) => (
    turma.totalDisciplinas === 3
    && turma.disciplinasConcluidas === 1
    && turma.gradeConcluida === false
  )));
});

test('erro de qualquer lote rejeita o enriquecimento inteiro', async () => {
  const ids = Array.from({ length: 201 }, (_, index) => `turma-${index + 1}`);
  const expectedError = new Error('falha no segundo lote');
  let callCount = 0;
  rpcImplementation = async (_rpcName, args) => {
    callCount += 1;
    return callCount === 2
      ? { data: null, error: expectedError }
      : { data: args.p_turma_ids.map(makeProgressRow), error: null };
  };

  await assert.rejects(
    enrichTechnicalAcademicProgress(ids.map(makeTurma)),
    (error) => error === expectedError,
  );
  assert.equal(callCount, 2);
});

test('resposta incompleta em qualquer lote não vira contagem silenciosa', async () => {
  const ids = Array.from({ length: 201 }, (_, index) => `turma-${index + 1}`);
  rpcImplementation = async (_rpcName, args) => ({
    data: args.p_turma_ids.filter((id) => id !== ids[200]).map(makeProgressRow),
    error: null,
  });

  await assert.rejects(
    enrichTechnicalAcademicProgress(ids.map(makeTurma)),
    /Progresso acadêmico indisponível para a turma turma-201/,
  );
});

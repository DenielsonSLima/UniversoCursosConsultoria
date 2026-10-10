import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const mock = { calls: [], response: { data: { id: 'atividade-1' }, error: null } };
globalThis.__turmaGradeAtividadeRpcTest = async (...args) => {
  mock.calls.push(args);
  return mock.response;
};

async function loadModule(path, stubSupabase = false) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))],
    bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
    plugins: stubSupabase ? [{
      name: 'isolated-rpc-fixture',
      setup(builder) {
        builder.onResolve({filter:/\/lib\/supabase$/}, () => ({path:'supabase-fixture',namespace:'fixture'}));
        builder.onLoad({filter:/.*/,namespace:'fixture'}, () => ({
          contents: 'export const supabase = { rpc: (...args) => globalThis.__turmaGradeAtividadeRpcTest(...args) };',
          loader:'js',
        }));
      },
    }] : [],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const { getTurmaAtividadeCapabilities: capabilities, validateTurmaAtividadeDraft: validate } = await loadModule('./turma-grade-atividade.utils.ts');
const { manageTurmaAtividade: manage } = await loadModule('./turma-grade-atividade.service.ts', true);
const activity = (overrides = {}) => ({
  id:'atividade-1', titulo:'Atividade sintética', cargaHoraria:4, prazoEntrega:'2026-09-12',
  status:'PUBLICADA', respostasCount:0, updatedAt:'2026-10-02T18:00:00.123456+00:00',
  contexto:{turmaId:'turma-1',turmaStatus:'EM_ANDAMENTO',modalidade:'TECNICO',periodoStatus:'ABERTO'},
  ...overrides,
});
const withContext = (changes, overrides = {}) => activity({
  ...overrides, contexto:{...activity().contexto,...changes},
});
const validDraft = {titulo:' Atividade corrigida ',prazoEntrega:'2026-09-12',horas:'4,5'};
const resetMock = (response = {data:{id:'atividade-1'},error:null}) => {
  mock.calls.length = 0;
  mock.response = response;
};

test('editing accepts past, current, future and empty deadlines without a today-based restriction', () => {
  for (const deadline of ['2000-01-01','2026-10-02','2099-12-31','']) {
    assert.equal(validate({...validDraft,prazoEntrega:deadline}), null);
  }
});

test('draft validation rejects malformed and impossible dates, including leap-year boundaries', () => {
  for (const deadline of ['2026-02-29','2026-02-30','2026-13-01','2026-00-10','02/10/2026','2026-1-2','2026-10-02Z','   ']) {
    assert.match(validate({...validDraft,prazoEntrega:deadline}), /data.*válida/i);
  }
  assert.equal(validate({...validDraft,prazoEntrega:'2024-02-29'}), null);
});

test('draft validation handles decimal comma and rejects empty, nonfinite and nonpositive workloads', () => {
  for (const value of ['0.1','0,5','4','8.5']) assert.equal(validate({...validDraft,horas:value}), null);
  for (const value of ['', ' ', '0', '-1', 'Infinity', '-Infinity', 'NaN', '1,2,3', 'abc']) {
    assert.match(validate({...validDraft,horas:value}), /carga horária/i);
  }
});

test('draft title is required and limited to 1000 characters after trimming', () => {
  assert.match(validate({...validDraft,titulo:' \t '}), /título/i);
  assert.match(validate({...validDraft,titulo:'x'.repeat(1001)}), /1000/);
  assert.equal(validate({...validDraft,titulo:' '+ 'x'.repeat(1000)+' '}), null);
});

test('technical activities expose actions only in supported operational periods', () => {
  for (const periodoStatus of ['ABERTO','EM_FECHAMENTO']) {
    assert.deepEqual(capabilities(withContext({periodoStatus})), {canManage:true,canEdit:true,estadoOriginal:'PUBLICADA'});
  }
  for (const changes of [{periodoStatus:'FECHADO'}, {periodoStatus:null}, {turmaStatus:'FINALIZADA'}, {turmaStatus:'PLANEJADA'}]) {
    assert.equal(capabilities(withContext(changes)).canManage, false);
  }
  assert.equal(capabilities(activity({contexto:undefined})).canManage, false);
});

test('drafts retain preparation management while archived published rows cannot become drafts', () => {
  for (const turmaStatus of ['PLANEJADA','INSCRICOES_ABERTAS']) {
    assert.equal(capabilities(withContext({turmaStatus},{status:'RASCUNHO'})).canManage, true);
    assert.deepEqual(capabilities(withContext({turmaStatus},{status:'ARQUIVADA',statusAnterior:'RASCUNHO'})),
      {canManage:true,canEdit:false,estadoOriginal:'RASCUNHO'});
    assert.equal(capabilities(withContext({turmaStatus},{status:'ARQUIVADA',statusAnterior:'PUBLICADA'})).canManage, false);
    assert.equal(capabilities(withContext({turmaStatus},{status:'ARQUIVADA',statusAnterior:null})).canManage, false);
  }
});

test('responses protect editing but preserve recoverable archive/restore controls', () => {
  assert.deepEqual(capabilities(activity({respostasCount:1})), {canManage:true,canEdit:false,estadoOriginal:'PUBLICADA'});
  assert.deepEqual(capabilities(activity({status:'ARQUIVADA',statusAnterior:'PUBLICADA',respostasCount:3})), {canManage:true,canEdit:false,estadoOriginal:'PUBLICADA'});
  assert.deepEqual(capabilities(activity({status:'ARQUIVADA',statusAnterior:null,respostasCount:3})), {canManage:false,canEdit:false,estadoOriginal:null});
});

test('nontechnical modalities preserve their established permission routing', () => {
  for (const modalidade of ['LIVRE','EAD','ESPECIALIZACAO']) {
    assert.equal(capabilities(withContext({modalidade,turmaStatus:'PLANEJADA',periodoStatus:null})).canManage, true);
  }
});

test('edit sends one canonical RPC with normalized values and the exact microsecond revision', async () => {
  resetMock();
  const record = activity();
  await manage({atividade:record,acao:'EDITAR',draft:validDraft});
  assert.deepEqual(mock.calls, [['gerenciar_atividade_extra_classe', {
    p_atividade_id:'atividade-1',p_acao:'EDITAR',p_titulo:'Atividade corrigida',
    p_prazo_entrega:'2026-09-12',p_carga_horaria:4.5,p_updated_at_esperado:record.updatedAt,
  }]]);
});

test('archive and restore never send editable fields or call a hard-delete path', async () => {
  for (const acao of ['ARQUIVAR','RESTAURAR']) {
    resetMock();
    await manage({atividade:activity(),acao});
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0][0], 'gerenciar_atividade_extra_classe');
    assert.deepEqual(mock.calls[0][1], {
      p_atividade_id:'atividade-1',p_acao:acao,p_titulo:null,p_prazo_entrega:null,
      p_carga_horaria:null,p_updated_at_esperado:activity().updatedAt,
    });
  }
  assert.doesNotMatch(source('./turma-grade-atividade.service.ts'), /\.delete\(/);
});

test('empty optional deadline becomes null and invalid drafts never reach the server', async () => {
  resetMock();
  await manage({atividade:activity(),acao:'EDITAR',draft:{...validDraft,prazoEntrega:''}});
  assert.equal(mock.calls[0][1].p_prazo_entrega, null);
  resetMock();
  await assert.rejects(manage({atividade:activity(),acao:'EDITAR'}));
  await assert.rejects(manage({atividade:activity(),acao:'EDITAR',draft:{...validDraft,horas:'NaN'}}));
  assert.equal(mock.calls.length, 0);
});

test('server failures propagate without retries or fake success', async () => {
  const failure = {code:'40001',message:'Atividade alterada'};
  resetMock({data:null,error:failure});
  await assert.rejects(manage({atividade:activity(),acao:'ARQUIVAR'}), (error) => error === failure);
  assert.equal(mock.calls.length, 1);
});

test('canonical response must identify the requested row, supporting object and singleton-array RPC results', async () => {
  for (const data of [null,[],{}, {id:'outra-atividade'}]) {
    resetMock({data,error:null});
    await assert.rejects(manage({atividade:activity(),acao:'ARQUIVAR'}), /não confirmou/);
  }
  for (const data of [{id:'atividade-1',status:'ARQUIVADA'},[{id:'atividade-1',status:'ARQUIVADA'}]]) {
    resetMock({data,error:null});
    assert.equal((await manage({atividade:activity(),acao:'ARQUIVAR'})).status, 'ARQUIVADA');
  }
});

test('both creation surfaces remain free of client-side past-date blocking', () => {
  const fullService = source('../atividades-extra/atividadesExtraClasse.service.ts');
  const creation = fullService.slice(fullService.indexOf('async createAtividade('), fullService.indexOf('async archiveAtividade('));
  assert.doesNotMatch(creation, /isAtividadePrazoEncerrado|igual ou posterior à data de hoje/);
  for (const file of ['./TurmaGradePlanejamentoForm.tsx','../atividades-extra/AtividadeExtraClasseForm.tsx','./TurmaGradeAtividadeEditor.tsx']) {
    const text = source(file);
    for (const input of text.match(/<input\b[^>]*>/gs) || []) {
      if (/type="date"/.test(input)) assert.doesNotMatch(input, /\bmin=/, file);
    }
  }
});

test('grade retains archived rows, response counts, revision and class context from the server', () => {
  const text = source('../../turma-grade.service.ts');
  const start = text.indexOf(".from('atividades_extra_classe')");
  const end = text.indexOf(".eq('turma_id', turmaId)", start);
  assert.ok(start >= 0 && end > start, 'A consulta de atividades deve estar delimitada pela turma.');
  const query = text.slice(start, end);
  assert.match(query, /status_antes_arquivo, updated_at, turma:turmas\(status\), respostas:atividade_extra_classe_respostas\(count\)/);
  assert.doesNotMatch(query, /\.neq\('status',\s*'ARQUIVADA'\)/);
  assert.match(text, /respostasCount: Number\(atividade\.respostas\?\.\[0\]\?\.count \|\| 0\)/);
  assert.match(text, /updatedAt: atividade\.updated_at \|\| null/);
});

test('UI guards repeated writes, preserves form on error and explains recoverable deletion', () => {
  const rows = source('./TurmaGradeAtividades.tsx');
  const editor = source('./TurmaGradeAtividadeEditor.tsx');
  assert.match(rows, /if \(pendingRef\.current\) return/);
  assert.match(rows, /finally \{ pendingRef\.current = false; \}/);
  assert.match(rows, /Respostas e notas serão preservadas/);
  assert.match(rows, /Sua carga horária deixará de compor os totais/);
  assert.match(rows, /Atividades arquivadas \(\{archived\.length\}\)/);
  assert.match(rows, /atividade\.status !== 'ARQUIVADA'/);
  assert.match(rows, /atividade\.status === 'ARQUIVADA'/);
  assert.match(rows, /Arquivar atividade/);
  assert.match(editor, /catch \{/);
  assert.match(editor, /event\.key === 'Escape' && !pending/);
  assert.doesNotMatch(rows + editor, /window\.(?:confirm|alert)\(/);
  const onError = rows.slice(rows.indexOf('onError:'), rows.indexOf('const manage ='));
  assert.doesNotMatch(onError, /setEditing(?:Id|Activity)\(null\)|setArchive(?:Id|Activity)\(null\)/);
});

test('editor and archive requests retain the revision captured when the user opened them', () => {
  const rows = source('./TurmaGradeAtividades.tsx');
  const editor = source('./TurmaGradeAtividadeEditor.tsx');
  assert.match(rows, /setEditingActivity\((?:atividade|\{ \.\.\.atividade \})\)/);
  assert.match(rows, /setArchiveActivity\((?:atividade|\{ \.\.\.atividade \})\)/);
  assert.match(rows, /manage\(\{ atividade: editingActivity, acao: 'EDITAR', draft \}\)/);
  assert.match(rows, /manage\(\{ atividade: archiveActivity, acao: 'ARQUIVAR' \}\)/);
  assert.match(rows, /revisionChanged=\{editingActivity\.updatedAt !== atividade\.updatedAt\}/);
  assert.match(editor, /if \(pending \|\| revisionChanged\) return/);
  assert.match(editor, /type="submit" disabled=\{pending \|\| revisionChanged\}/);
  assert.match(editor, /revisionChanged &&/);
  assert.match(editor, /cancele.*(?:reabra|abra novamente)/i);
  assert.doesNotMatch(editor, /useEffect[\s\S]*setDraft/);
});

test('activity changes invalidate only relevant academic, activity, diary and class-list families', () => {
  const text = source('./TurmaGradeAtividades.tsx');
  for (const expected of [
    'academicLifecycleKeys.grade(contexto.turmaId)', 'academicLifecycleKeys.atividades(contexto.turmaId)',
    'academicLifecycleKeys.diarios(contexto.turmaId)', 'academicLifecycleKeys.resumo(contexto.turmaId)',
    'atividadesExtraClasseKeys.turma(contexto.turmaId)',
    'diarioClasseKeys.resultadosByTurma(contexto.turmaId)', 'diarioClasseKeys.praticasByTurma(contexto.turmaId)',
    'gestaoQueryKeys.classesByModality(', 'gestaoQueryKeys.activeClassesRoot()',
  ]) assert.ok(text.includes(expected), expected);
  assert.doesNotMatch(text, /queryKey: academicLifecycleKeys\.turma\(/);
  assert.doesNotMatch(text, /invalidateQueries\(\s*\)|invalidateQueries\(\s*\{\s*\}\s*\)/);
});

test('civil activity dates do not shift across UTC, Maceio and UTC+14 time zones', async () => {
  const { formatAtividadeDate } = await loadModule('../atividades-extra/atividadesExtraClasse.utils.ts');
  const previousZone = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Maceio', 'Pacific/Kiritimati']) {
      process.env.TZ = zone;
      assert.equal(validate({ ...validDraft, prazoEntrega: '2026-09-12' }), null);
      assert.equal(formatAtividadeDate('2026-09-12'), '12/09/2026');
      assert.equal(validate({ ...validDraft, prazoEntrega: '2026-02-29' }), 'Informe uma data de entrega válida.');
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousZone;
  }
});

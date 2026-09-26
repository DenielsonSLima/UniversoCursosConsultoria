import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

// PGlite é ferramenta de teste isolada, não dependência do aplicativo.
// Instalação/execução reproduzível consta no registro deste lote.
const packagePath = process.env.ACADEMIC_TEST_PGLITE_PATH;
const importPath = (suffix) => packagePath
  ? pathToFileURL(resolve(packagePath, `dist/${suffix}.js`)).href
  : `@electric-sql/pglite${suffix === 'index' ? '' : `/${suffix}`}`;
const { PGlite } = await import(importPath('index'));
const { pgcrypto } = await import(importPath('contrib/pgcrypto'));
const db = new PGlite({ extensions: { pgcrypto } });
const sql = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migrations = [
  '20260926174000_decouple_technical_academic_activation.sql',
  '20260926174100_activate_technical_enrollment_on_admission.sql',
  '20260926174200_align_technical_academic_workflow.sql',
  '20260926174300_reconcile_started_technical_enrollments.sql',
];
const uuid = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const scalar = async (statement, params = []) => Object.values((await db.query(statement, params)).rows[0])[0];
let nextId = 100;

async function setupClass(status = 'EM_ANDAMENTO', modalidade = 'TECNICO') {
  const course = uuid(nextId++);
  const turma = uuid(nextId++);
  await db.query('insert into cursos (id,nome,modalidade) values ($1,$2,$3)', [course, 'Curso teste', modalidade]);
  await db.query('insert into turmas (id,curso_id,status,nome) values ($1,$2,$3,$4)', [turma, course, status, 'Turma teste']);
  return turma;
}

async function enroll(turma, requestId = uuid(nextId++), studentId = uuid(nextId++)) {
  await db.query("insert into parceiros values ($1,'Aluno') on conflict do nothing", [studentId]);
  const response = await scalar('select pre_vincular_aluno_tecnico_secure($1,$2,$3)', [turma, studentId, requestId]);
  return { response, requestId, studentId, id: response.matricula.matriculaId };
}

async function fixtureEnrollment(turma, status = 'PENDENTE', fluxo = 'REGULAR') {
  const student = uuid(nextId++);
  const id = uuid(nextId++);
  await db.query("insert into parceiros values ($1,'Aluno')", [student]);
  // Fixtures incluem estados de saída existentes, sem executar ações reais.
  await db.exec('alter table matriculas disable trigger protect_technical_enrollment_lifecycle_trigger');
  await db.query('insert into matriculas (id,aluno_id,turma_id,status,fluxo_operacional) values ($1,$2,$3,$4,$5)', [id, student, turma, status, fluxo]);
  await db.exec('alter table matriculas enable trigger protect_technical_enrollment_lifecycle_trigger');
  return id;
}

before(async () => {
  await db.exec(sql('./academic_activation.fixture.sql'));
  const previousMigration = sql('../migrations/20260809060000_create_deferred_technical_financial_activation.sql');
  const originalGuard = previousMigration.match(/create or replace function public\.protect_technical_enrollment_lifecycle\(\)[\s\S]*?\$function\$;/i)?.[0];
  assert.ok(originalGuard, 'a guarda real de autorização deve ser carregada');
  await db.exec(originalGuard);
  await db.exec(`create trigger protect_technical_enrollment_lifecycle_trigger
    before insert or update on matriculas for each row
    execute function protect_technical_enrollment_lifecycle();`);
  for (const path of migrations.slice(0, 3)) await db.exec(sql(`../migrations/${path}`));
  await db.exec(`create trigger trg_guard_technical_activation_document_versions
    before insert or update of status, aluno_id, turma_id on matriculas
    for each row execute function guard_technical_activation_document_versions();`);
  await db.exec(`select set_config('test.actor','${uuid(1)}',false),
    set_config('test.role','authenticated',false), set_config('test.allowed','true',false);`);
});
after(async () => { await db.close(); });

test('novo vínculo em turma iniciada fica ativo, sem cobrança ou checklist concluído', async () => {
  const turma = await setupClass();
  const enrollment = await enroll(turma);
  assert.equal(enrollment.response.matricula.statusAcademico, 'ATIVO');
  assert.equal(enrollment.response.matricula.situacaoFinanceira, 'PENDENTE');
  assert.equal(enrollment.response.cobrancaGerada, false);
  assert.equal(await scalar('select count(*)::int from contas_receber'), 0);
  const snapshot = await scalar('select matricula_tecnica_workflow_snapshot($1)', [enrollment.id]);
  assert.equal(snapshot.pagamento.estado, 'PENDENTE');
  assert.equal(snapshot.documentacao.concluida, false);
  assert.deepEqual(snapshot.acoes.ativarRegular.bloqueios, ['STATUS_INCOMPATIVEL']);
  assert.equal(await scalar('select status_novo from matricula_movimentacoes where matricula_id=$1', [enrollment.id]), 'ATIVO');

  const replay = await enroll(turma, enrollment.requestId, enrollment.studentId);
  assert.equal(replay.response.replayed, true);
  assert.equal(replay.id, enrollment.id);
  assert.equal(await scalar('select count(*)::int from matricula_movimentacoes where matricula_id=$1', [enrollment.id]), 1);
});

test('turma não iniciada mantém pendência e bloqueio estritamente acadêmico', async () => {
  const turma = await setupClass('PLANEJADA');
  const { id, response } = await enroll(turma);
  assert.equal(response.matricula.statusAcademico, 'PENDENTE');
  const snapshot = await scalar('select matricula_tecnica_workflow_snapshot($1)', [id]);
  assert.deepEqual(snapshot.acoes.ativarRegular.bloqueios, ['TURMA_FORA_DE_ANDAMENTO']);
  await assert.rejects(scalar('select ativar_matricula_tecnica_apos_documentos($1)', [id]), /turma em andamento/);
});

test('ativação manual dispensa pagamento, documentos e lote documental em andamento', async () => {
  const turma = await setupClass();
  const id = await fixtureEnrollment(turma);
  await db.query("insert into documentos_aluno_lotes select aluno_id,'aguardando_mapeamento',now() from matriculas where id=$1", [id]);
  const before = await scalar('select matricula_tecnica_workflow_snapshot($1)', [id]);
  assert.equal(before.acoes.ativarRegular.permitida, true);
  const result = await scalar('select ativar_matricula_tecnica_apos_documentos($1)', [id]);
  assert.equal(result.status, 'ATIVO');
  assert.equal(result.documentacao.envioEmAndamento, true);
  assert.equal(await scalar('select responsavel_id from matricula_movimentacoes where matricula_id=$1', [id]), uuid(99));
  await scalar('select ativar_matricula_tecnica_apos_documentos($1)', [id]);
  assert.equal(await scalar('select count(*)::int from matricula_movimentacoes where matricula_id=$1', [id]), 1);
});

test('permissão é exigida inclusive para replay e update direto continua bloqueado', async () => {
  const turma = await setupClass();
  const enrollment = await enroll(turma);
  const pending = await fixtureEnrollment(turma);
  await assert.rejects(db.query("update matriculas set status='ATIVO' where id=$1", [pending]), /ação acadêmica oficial/);
  await db.exec("select set_config('test.allowed','false',false)");
  await assert.rejects(enroll(turma, enrollment.requestId, enrollment.studentId), /Sem permissão/);
  await assert.rejects(scalar('select ativar_matricula_tecnica_apos_documentos($1)', [pending]), /permissão/);
  await db.exec("select set_config('test.allowed','true',false)");
  assert.equal(await scalar("select has_function_privilege('authenticated', 'internal_academic.activate_started_technical_enrollment(uuid,boolean)', 'EXECUTE')"), false);
});

test('reconciliação sem JWT corrige pendentes, preserva financeiro e não reabre saídas', async () => {
  const turma = await setupClass();
  const id = await fixtureEnrollment(turma);
  const excluded = [];
  for (const status of ['CANCELADO', 'TRANCADO', 'DESISTENTE', 'TRANSFERIDO', 'CONCLUIDO']) {
    excluded.push([await fixtureEnrollment(turma, status), status]);
  }
  excluded.push([await fixtureEnrollment(turma, 'PENDENTE', 'IMPLANTACAO'), 'PENDENTE']);
  const ead = await fixtureEnrollment(await setupClass('EM_ANDAMENTO', 'EAD'));
  excluded.push([ead, 'PENDENTE']);
  await db.query("insert into matriculas_tecnicas_financeiro_config (matricula_id,status_financeiro,regra_revisao) values ($1,'GERADA',4)", [id]);
  await db.query("insert into contas_receber (matricula_id,status,valor,valor_pago,referencia_bancaria) values ($1,'PENDENTE',260,null,'referencia-teste')", [id]);
  const financeBefore = await db.query('select * from matriculas_tecnicas_financeiro_config where matricula_id=$1', [id]);
  const receivablesBefore = await db.query('select * from contas_receber where matricula_id=$1', [id]);
  await db.exec("select set_config('test.actor','',false),set_config('test.role','',false),set_config('test.allowed','false',false)");
  await db.exec(sql(`../migrations/${migrations[3]}`));
  assert.equal(await scalar('select status from matriculas where id=$1', [id]), 'ATIVO');
  assert.deepEqual((await db.query('select * from matriculas_tecnicas_financeiro_config where matricula_id=$1', [id])).rows, financeBefore.rows);
  assert.deepEqual((await db.query('select * from contas_receber where matricula_id=$1', [id])).rows, receivablesBefore.rows);
  for (const [excludedId, status] of excluded) assert.equal(await scalar('select status from matriculas where id=$1', [excludedId]), status);
  assert.equal(await scalar("select coalesce(current_setting('request.jwt.claim.role',true),'')"), '');
  await db.exec(`select set_config('test.actor','${uuid(1)}',false),set_config('test.role','authenticated',false),set_config('test.allowed','true',false)`);
});

test('início da turma ativa pendentes uma vez e conserva implantação e cancelados', async () => {
  const turma = await setupClass('INSCRICOES_ABERTAS');
  const { id } = await enroll(turma);
  const cancelled = await fixtureEnrollment(turma, 'CANCELADO');
  const implantation = await fixtureEnrollment(turma, 'PENDENTE', 'IMPLANTACAO');
  await db.query("update turmas set status='EM_ANDAMENTO' where id=$1", [turma]);
  assert.equal(await scalar('select status from matriculas where id=$1', [id]), 'ATIVO');
  assert.equal(await scalar('select status from matriculas where id=$1', [cancelled]), 'CANCELADO');
  assert.equal(await scalar('select status from matriculas where id=$1', [implantation]), 'PENDENTE');
  await db.query("update turmas set status='EM_ANDAMENTO' where id=$1", [turma]);
  assert.equal(await scalar("select count(*)::int from matricula_movimentacoes where matricula_id=$1 and tipo='REATIVACAO'", [id]), 1);
});

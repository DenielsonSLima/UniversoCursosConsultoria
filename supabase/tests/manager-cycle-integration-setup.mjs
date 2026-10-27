import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadIntegrationDatabase } from './bounded-integration-setup.mjs';
export const id = (n) => `20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const actor='10000000-0000-4000-8000-000000000001';
export const polo='10000000-0000-4000-8000-000000000002';
const read = (p) => readFile(new URL(p,import.meta.url),'utf8');
const sql = async (db,p) => db.exec(await read(p));
export async function createManagerDatabase({patch=true}={}) {
  const {PGlite}=await import(process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
  const db=new PGlite();
  await loadIntegrationDatabase(db);
  await sql(db,'./fixtures/eligibility-schema.sql');
  await db.exec('set check_function_bodies=off');
  await db.exec('drop function internal_academic.technical_manual_cycle_state_before_durable_imported_history(uuid)');
  for(const file of (await readdir(new URL('./fixtures/',import.meta.url))).filter(f=>f.startsWith('eligibility-')&&f!=='eligibility-schema.sql').sort())
    await sql(db,`./fixtures/${file}`);
  for(const file of ['calculation.sql','snapshots.sql','previews.sql','creation.sql','guards.sql','state-and-authorization.sql','legacy-preview-and-proesc.sql','fixture.sql'])
    await sql(db,`./fixtures/manager-cycle/${file}`);
  await db.exec('set check_function_bodies=on');
  await db.exec(`set test.jwt.role='authenticated';set test.actor='${actor}';`);
  if(patch) await applyManagerPatch(db);
  return db;
}
export async function seedManagerEnrollment(db,n,{imported=true,implantation=true,policy=true}={}) {
  const enrollment=id(n),turma=id(n+1000),person=id(n+2000),course=id(n+3000);
  await db.query('INSERT INTO public.cursos VALUES ($1,\'TECNICO\')',[course]);
  await db.query(`INSERT INTO public.turmas(id,polo_id,curso_id,codigo,nome,qtd_parcelas)
    VALUES ($1,$2,$3,'SYNTHETIC','Turma financeira sintética',12)`,[turma,polo,course]);
  await db.query(`INSERT INTO public.parceiros VALUES ($1,'00000000000')`,[person]);
  await db.query(`INSERT INTO public.matriculas(id,turma_id,aluno_id,status,fluxo_operacional)
    VALUES ($1,$2,$3,'ATIVO',$4)`,[enrollment,turma,person,implantation?'IMPLANTACAO':'NORMAL']);
  await db.query('INSERT INTO public.matriculas_tecnicas_financeiro_config(matricula_id) VALUES ($1)',[enrollment]);
  if(policy) await db.query(`INSERT INTO internal_academic.technical_manual_cycle_policies
    VALUES ($1,'MANUAL',$2,$3,2,$4,true,1)`,[turma,imported?'IMPORTADA_CICLO_1':'NOVA',imported?1:0,imported?'HISTORICO_EXTERNO':'MANUAL_APOS_EMISSAO']);
  if(imported) {
    await db.query(`INSERT INTO internal_proesc.class_scopes(id,turma_id,polo_id,phase,batch_id,financial_mode)
      VALUES ($1,$2,$3,'CONFIRMED',$4,'HISTORY_ONLY')`,[id(n+4000),turma,polo,id(n+5000)]);
    await db.query(`INSERT INTO internal_proesc.enrollment_sources(matricula_id,source_verified,source_status,financial_review_state)
      VALUES ($1,false,'UNKNOWN','REVIEW_REQUIRED')`,[enrollment]);
  }
  const rule={identidade:{efetivaFingerprint:'a'.repeat(64),turmaFingerprint:'a'.repeat(64),turmaRevisao:1},
    cobranca:{matricula:{habilitada:true,valor:'100.00'},mensalidade:{habilitada:true,quantidade:12,valor:'250.00'},rematricula:{habilitada:true,valor:'100.00'}},
    vencimento:{diaBase:5},encargos:{descontoPontualidade:'0',jurosAtrasoPercentual:'0',multaAtrasoPercentual:'0'},
    aplicacao:{matricula:{desconto:false,multaJuros:false},mensalidade:{desconto:false,multaJuros:false},rematricula:{desconto:false,multaJuros:false}},
    boleto:{instrucao:'Instrução sintética'},continuidade:{maxCiclos:2}};
  await db.query('INSERT INTO public.manager_fixture_rules VALUES ($1,$2::jsonb)',[enrollment,JSON.stringify(rule)]);
  return {enrollment,turma,person,course};
}
export async function previewManager(db,enrollment,cycle=2) {
  const due=new Date(Date.now()+10*86400000).toISOString().slice(0,10);
  return (await db.query('SELECT public.preview_ciclo_financeiro_tecnico_manual_secure($1,$2,$3,NULL) AS value',
    [enrollment,cycle,due])).rows[0].value;
}
export async function prepareManager(db,context,request=id(8000)) {
  const p=context.preview;
  return (await db.query(`SELECT public.preparar_emissao_ciclo_financeiro_tecnico_manual_secure($1,$2,$3,$4,$5,$6,$7,NULL) AS value`,
    [context.matriculaId,p.cicloNumero,p.primeiroVencimento,request,p.regraEfetivaFingerprint,p.politicaFingerprint,p.cronogramaFingerprint])).rows[0].value;
}

export async function applyManagerPatch(db) {
  for(const file of ['20261027121000_enrollment_financial_source_projection.sql',
    '20261027121100_manual_cycle_manager_decision.sql','20261027121200_manual_cycle_manager_choice.sql'])
    await sql(db,`../migrations/${file}`);
}

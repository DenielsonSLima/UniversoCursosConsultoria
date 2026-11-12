import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import test from 'node:test';
const result=await build({entryPoints:['modules/aluno/turmas/turmas.utils.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const utils=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const row=(status='PENDENTE',date=Date.now()+60_000)=>({status,acesso_temporario_ate:new Date(date).toISOString(),turmas:{cursos:{modalidade:'EAD'}}});
test('actual My Courses predicates show and unlock valid trust enrollment',()=>{
 for(const predicate of [utils.isPortalEnrollmentVisible,utils.hasEadAccess]){
  assert.equal(predicate(row()),true);
  assert.equal(predicate(row('PENDENTE',1)),false);
  assert.equal(predicate(row('CANCELADO')),false);
  assert.equal(predicate({...row(),acesso_temporario_ate:null}),false);
 }
});
test('home readers retain trust rows; My Courses buttons use the same access guard',async()=>{
 const home=(await readFile('modules/aluno/inicio/InicioPage.tsx','utf8'))
  +(await readFile('modules/aluno/inicio/useAlunoHomeData.ts','utf8'));
 assert.doesNotMatch(home,/\.in\('status',\s*\['ATIVO', 'CONCLUIDO', 'EM_DEPENDENCIA'\]\)/);
 assert.match(home,/filter\(isHomeEnrollmentVisible\)/);
 for(const file of ['AlunoTurmasList.tsx','TurmaDetail.tsx','mobile/AlunoMobileCourseCard.tsx']){
  const source=await readFile(`modules/aluno/turmas/components/${file}`,'utf8');
  assert.match(source,/hasEadAccess\(matricula\)/);
 }
});
test('My Courses schedules expiration independently of query structural sharing',async()=>{
 const source=await readFile('modules/aluno/turmas/hooks/useAlunoTurmasData.ts','utf8');
 assert.match(source,/setTimeout\(\(\) => setAccessClock\(Date\.now\(\)\)/);
 assert.match(source,/clearTimeout\(timer\)/);
 assert.match(source,/\[matriculas, accessClock\]/);
});

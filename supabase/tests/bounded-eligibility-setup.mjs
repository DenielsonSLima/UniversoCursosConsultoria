import {readFile,readdir} from 'node:fs/promises';
import {createIntegrationDatabase} from './bounded-integration-setup.mjs';
import {uid} from './bounded-seed.mjs';
export async function createEligibilityDatabase() {
 const db=await createIntegrationDatabase();
 const dir=new URL('./fixtures/',import.meta.url);
 await db.exec(await readFile(new URL('eligibility-schema.sql',dir),'utf8'));
 // SQL-language bodies have circular dependencies; creation check is deferred,
 // then all functions execute against real synthetic relations below.
 await db.exec('set check_function_bodies=off');
 await db.exec('drop function internal_academic.technical_manual_cycle_state_before_durable_imported_history(uuid)');
 for(const file of (await readdir(dir)).filter(f=>f.startsWith('eligibility-')&&f!=='eligibility-schema.sql').sort())
   await db.exec(await readFile(new URL(file,dir),'utf8'));
 await db.exec('set check_function_bodies=on');
 // Each synthetic enrollment has its own person. The base banking fixture uses
 // one person for convenience, which canonically means protected shared history.
 await db.exec(`insert into public.cursos values('${uid(30000)}','TECNICO');
 update public.turmas set curso_id='${uid(30000)}';
 alter table public.contas_receber disable trigger user;
 insert into internal_academic.technical_manual_cycle_policies values('${uid(5)}','MANUAL','NOVA',0,2,'MANUAL_APOS_EMISSAO',true,1);
 insert into public.matriculas_tecnicas_financeiro_config select id from public.matriculas;
 update public.matriculas set aluno_id=id;
 insert into public.parceiros select id,'00000000000' from public.matriculas;
 update public.contas_receber r set cliente_id=m.aluno_id from public.matriculas m where m.id=r.matricula_id;
 update public.contas_receber set matricula_id=null,cliente_id='${uid(30001)}' where id>='${uid(20000)}';`);
 await db.exec("alter table public.contas_receber enable trigger user");
 await db.exec(`update internal_academic.technical_manual_receivable_issuance_authorizations a set receivable_fingerprint=internal_academic.technical_manual_receivable_issuance_fingerprint(r) from public.contas_receber r where r.id=a.receivable_id`);
 return db;
}

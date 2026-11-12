import fs from 'node:fs';import assert from 'node:assert/strict';
const { PGlite }=await import(process.env.PGLITE_MODULE_URL||'@electric-sql/pglite');const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema private;create table parceiros(id uuid primary key,tipo text,numero text,nome text);
insert into parceiros values('00000000-0000-0000-0000-000000000001','Aluno',null,'Teste'),('00000000-0000-0000-0000-000000000002','Aluno','00','Real'),('00000000-0000-0000-0000-000000000003','Aluno',null,'Editado');`);
const run=async path=>db.exec(fs.readFileSync(new URL(path,import.meta.url),'utf8'));
await run('../migrations/20261112151657_student_address_number_required.sql');await run('../operations/student_address_number_backfill.sql');
await db.exec(`update parceiros set nome='Editado depois' where id='00000000-0000-0000-0000-000000000003'`);
await run('../migrations/20261112154033_student_address_number_default_sn.sql');await run('../operations/student_address_number_replace_sn.sql');
assert.deepEqual((await db.query('select numero from parceiros order by id')).rows.map(x=>x.numero),['S/N','00','00']);
await run('../operations/student_address_number_replace_sn.sql');assert.equal((await db.query("select count(*)::int n from private.student_address_number_backfill where batch='20261112_student_number_sn'")).rows[0].n,1);
for(const value of [null,'','  ']){const r=await db.query("insert into parceiros values(gen_random_uuid(),'Aluno',$1,'Novo') returning numero",[value]);assert.equal(r.rows[0].numero,'S/N');}
await assert.rejects(db.query("insert into parceiros values(gen_random_uuid(),'Aluno',$1,'Longo')",['a'.repeat(61)]));
await run('../operations/student_address_number_sn_rollback.sql');assert.equal((await db.query("select numero from parceiros where id='00000000-0000-0000-0000-000000000001'")).rows[0].numero,'00');
await db.close();console.log('PASS SN default; only audited unchanged00; real00 and later edits preserved; idempotent and rollback');

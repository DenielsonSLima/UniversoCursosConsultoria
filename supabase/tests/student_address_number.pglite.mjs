import fs from 'node:fs';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE_URL || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema private;
create table public.parceiros(id uuid primary key,tipo text,numero text, nome text);
insert into parceiros values('00000000-0000-0000-0000-000000000001','Aluno',null,'Teste'),('00000000-0000-0000-0000-000000000002','Aluno','123','Teste');`);
await db.exec(fs.readFileSync(new URL('../migrations/20261112151657_student_address_number_required.sql', import.meta.url),'utf8'));
for(const numero of [null,'','   ','a'.repeat(61)]) {
 await assert.rejects(db.query('insert into parceiros values(gen_random_uuid(),$1,$2,$3)',['Aluno',numero,'Teste']));
}
for(const numero of ['00','S/N','123']) await db.query('insert into parceiros values(gen_random_uuid(),$1,$2,$3)',['Aluno',numero,'Teste']);
await db.exec(`insert into parceiros values(gen_random_uuid(),'Fornecedor',null,'Teste');update parceiros set nome='Outro teste';`);
await assert.rejects(db.exec(`update parceiros set numero=' ' where numero='123'`));
await db.exec(fs.readFileSync(new URL('../operations/student_address_number_backfill.sql', import.meta.url),'utf8'));
assert.equal((await db.query('select count(*)::int n from private.student_address_number_backfill')).rows[0].n,1);
await db.exec(fs.readFileSync(new URL('../operations/student_address_number_backfill.sql', import.meta.url),'utf8'));
assert.equal((await db.query('select count(*)::int n from private.student_address_number_backfill')).rows[0].n,1);
await db.exec(fs.readFileSync(new URL('../operations/student_address_number_rollback.sql', import.meta.url),'utf8'));
assert.equal((await db.query("select numero from parceiros where id='00000000-0000-0000-0000-000000000001'")).rows[0].numero,null);
await db.exec(`set role authenticated`);
await assert.rejects(db.query('select * from private.student_address_number_backfill'));
await db.close();console.log('PASS required new/edited student number, max60, explicit00/SN accepted, unrelated updates/types unchanged, audit protected');

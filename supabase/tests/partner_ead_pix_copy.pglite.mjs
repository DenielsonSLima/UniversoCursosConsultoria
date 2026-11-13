// Isolated PostgreSQL WASM contract; never connects to a remote database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBanesePixPayloadFixture } from '../functions/banese/internal/testing/pix-fixture.ts';
const { PGlite } = await import(process.env.PGLITE_MODULE_URL || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const payload = buildBanesePixPayloadFixture('SYNTHETICPARTNER', 100);
const image = 'iVBORw0KGgoSYNTHETICIMAGE';

await db.exec(`
  create role anon; create role authenticated; create schema auth;
  create function auth.uid() returns uuid language sql as $$
    select nullif(current_setting('test.uid',true),'')::uuid
  $$;
  create function public.is_gestor_for_polo(uuid) returns boolean language sql as $$
    select current_setting('test.active')='yes' and $1::text=current_setting('test.polo')
  $$;
  create function public.is_partner_in_gestor_read_scope(uuid,uuid[]) returns boolean language sql as $$
    select auth.uid() is not null and public.is_gestor_for_polo($1)
  $$;
  create table parceiros(id uuid,polo_id uuid,polo_ids uuid[]);
  create table polos(id uuid,nome text);
  create table cursos(id uuid,nome text,modalidade text);
  create table turmas(id uuid,curso_id uuid,polo_id uuid,nome text,codigo text);
  create table matriculas(id uuid,aluno_id uuid,turma_id uuid,status text,data_matricula date);
  create table contas_receber(
    id uuid,cliente_id uuid,matricula_id uuid,turma_id uuid,polo_id uuid,descricao text,
    valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,status text,
    tipo_lancamento text,gateway_provider text,gateway_payment_method text,gateway_environment text,
    gateway_boleto_codigo_barras text,gateway_boleto_linha_digitavel text,gateway_boleto_issued_at timestamptz,
    gateway_pix_payload text,gateway_pix_encoded_image text,gateway_status text
  );
  grant usage on schema public,auth to authenticated;
  grant select on all tables in schema public to authenticated;
  alter table contas_receber enable row level security;
  create policy legacy on contas_receber for select to authenticated using(
    current_setting('test.finance')='yes' and public.is_gestor_for_polo(polo_id)
  );
  set test.uid='${id(99)}'; set test.active='yes'; set test.polo='${id(1)}'; set test.finance='no';
  insert into polos values('${id(1)}','Polo');
  insert into parceiros values('${id(2)}','${id(1)}','{}');
  insert into cursos values('${id(3)}','EAD','EAD'),('${id(30)}','Técnico','TECNICO');
  insert into turmas values
    ('${id(4)}','${id(3)}','${id(1)}','Turma EAD','A'),
    ('${id(40)}','${id(30)}','${id(1)}','Turma Técnica','B');
  insert into matriculas values
    ('${id(5)}','${id(2)}','${id(4)}','ATIVO','2026-11-01'),
    ('${id(50)}','${id(2)}','${id(40)}','ATIVO','2026-11-01');
`);
for (const [receivable, enrollment, turma] of [[6,5,4],[60,50,40]]) {
  await db.query(`insert into contas_receber values(
    $1,$2,$3,$4,$5,'Cobrança sintética',100,null,'2026-12-01',null,'PENDENTE','PARCELA',
    'banese_card','BOLETO','production','123','123',now(),$6,$7,'PENDING'
  )`, [id(receivable),id(2),id(enrollment),id(turma),id(1),payload,image]);
}
for (const migration of [
  '20261112123418_partner_ead_boleto_read.sql',
  '20261112131518_partner_finance_course_groups.sql',
  '20261113002346_partner_ead_pix_copy.sql',
]) {
  await db.exec(fs.readFileSync(new URL(`../migrations/${migration}`,import.meta.url),'utf8'));
}
await db.exec('set role authenticated');
const read = async () => (await db.query(
  `select parceiro_aluno_financeiro_visualizacao('${id(2)}') as result`,
)).rows[0].result;
const selected = async () => (await read()).items.find(item => item.id === id(6));
const update = async (column, value) => {
  await db.exec('reset role');
  await db.query(`update contas_receber set ${column}=$1 where id=$2`,[value,id(6)]);
  await db.exec('set role authenticated');
};

// Gestor without Financeiro retains the narrow EAD access, without direct financial table reads.
assert.equal((await db.query('select count(*)::int as total from contas_receber')).rows[0].total,0);
let result = await read();
assert.equal(result.items.length,1);
assert.equal(result.summary.open,100);
assert.equal(result.items[0].pix_copy_payload,payload);
assert.equal(result.items[0].turmas.cursos.modalidade,'EAD');
assert.equal('gateway_pix_encoded_image' in result.items[0],false);
assert.equal('gateway_pix_payload' in result.items[0],false);

// Legacy financial access never grants the new EAD-only Pix projection to Técnico.
await db.exec("set test.finance='yes'");
result = await read();
assert.equal(result.items.length,2);
assert.equal(result.summary.open,200);
assert.equal(result.items.find(item => item.id === id(60)).pix_copy_payload,undefined);
await db.exec("set test.finance='no'");

for (const bankStatus of ['PENDING','OPEN','REGISTERED','CREATED','2']) {
  await update('gateway_status',bankStatus);
  assert.equal((await selected()).pix_copy_payload,payload);
}
for (const bankStatus of [null,'',' ','PAID','RECEIVED','CONFIRMED','CANCELED','CANCELLED','CANCELED_BY_BANK','REFUNDED','UNKNOWN']) {
  await update('gateway_status',bankStatus);
  assert.equal((await selected()).pix_copy_payload,null);
}
await update('gateway_status','PENDING');
for (const [column,blocked,restored] of [
  ['status','PAGO','PENDENTE'], ['status','CANCELADO','PENDENTE'], ['status','SUSPENSO','PENDENTE'],
  ['data_pagamento','2026-11-12',null], ['valor_pago',1,null],
  ['gateway_environment','sandbox','production'], ['gateway_payment_method','PIX','BOLETO'],
  ['gateway_provider','outro','banese_card'], ['gateway_boleto_issued_at',null,'2026-11-12T12:00:00Z'],
  ['gateway_pix_payload',null,payload], ['gateway_pix_encoded_image',null,image],
  ['gateway_pix_payload',' ',payload], ['gateway_pix_encoded_image',' ',image],
]) {
  await update(column,blocked);
  assert.equal((await selected()).pix_copy_payload,null,`${column} must hide Pix`);
  await update(column,restored);
}
await update('status','VENCIDO');
assert.equal((await selected()).pix_copy_payload,payload);

for (const settings of [
  "set test.active='no'", "set test.active='yes';set test.uid=''",
  `set test.uid='${id(99)}';set test.polo='${id(9)}'`,
]) {
  await db.exec(settings);
  await assert.rejects(read);
}
await db.exec(`set test.polo='${id(1)}'`);
for (const [column,wrong,correct] of [
  ['turma_id',id(40),id(4)],['polo_id',id(9),id(1)],
]) {
  await update(column,wrong);
  assert.equal((await read()).items.length,0);
  await update(column,correct);
}
await db.exec(`reset role;update matriculas set aluno_id='${id(9)}' where id='${id(5)}';set role authenticated`);
assert.equal((await read()).items.length,0);
await db.exec('reset role;set role anon');
await assert.rejects(read);
await db.close();
console.log('PASS: scoped EAD Pix projection, unpaid/complete pair, terminal guards, legacy RLS and course grouping');

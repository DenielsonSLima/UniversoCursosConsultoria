import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = name => readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope = [id(11), id(10), id(1), 'PRODUCAO', '2026-11'];

test('service competence resolves the saved rule once; replay never recomputes from model, payment month or next day', async t => {
  const db = new PGlite();
  const model = { name: 'MODELO SINTÉTICO', active: true, nationalServiceCode: '080201', nbsCode: '122020000',
    serviceDescription: 'DESCRIÇÃO MODELO', issTreatment: 'TRIBUTAVEL',
    peopleOptions: { version: 2, competenceMode: 'ISSUE_DATE', competenceDate: null } };
  const op = (request, input) => db.query('SELECT public.nfse_individual_operation_internal($1,$2,$3,$4,$5,$6,$7,$8,$9) value',
    [...scope, id(request), 'PREVIEW_QUEUE', null, input]).then(result => result.rows[0].value);
  const input = { source: { kind: 'PARTNER_SERVICE', id: id(40) } };
  let row;
  try {
    await db.exec(await readFile(new URL('./nfse_individual_production.fixture.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('./nfse_queue_emission.fixture.sql', import.meta.url), 'utf8'));
    await db.exec(`CREATE FUNCTION private.nfse_review_valid_document(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT true$$;`);
    await db.query('INSERT INTO public.test_authorization VALUES($1,$2,$3,true)', [id(11), id(10), id(1)]);
    await db.query("INSERT INTO public.polos VALUES($1,'00000000000100','ativo')", [id(1)]);
    await db.query("INSERT INTO public.parceiros(id,nome,cpf_cnpj,tipo,status,polo_id,polo_ids) VALUES($1,'PESSOA SINTÉTICA','00000000191','PF','ativo',$2,'{}')", [id(30), id(1)]);
    await db.query("INSERT INTO private.nfse_models VALUES($1,$2,'PRODUCAO',$3,3,$4,$4)", [id(20), id(1), model, id(11)]);
    await db.query("INSERT INTO private.nfse_configurations VALUES($1,'PRODUCAO',$1,$2,3,$3)", [id(1), { municipalityCode: '2803401', portalAccess: 'CERTIFICATE' }, id(11)]);
    await db.query("INSERT INTO private.nfse_certificates VALUES($1,'PRODUCAO',$2,'00000000000100',now()-interval '1 day',now()+interval '1 year',repeat('a',64),$3)", [id(1), id(80), id(11)]);
    await db.query(`INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,service_description,amount,partner_snapshot,model_snapshot,receivable_action,created_by)
      VALUES($1,$2,'PRODUCAO',$3,$4,'2026-11-10','DESCRIÇÃO FINAL DA PREPARAÇÃO',1.00,'{}',$5,'NONE',$6)`,
    [id(40), id(1), id(30), id(20), { ...model, id: id(20), version: 3 }, id(11)]);
    for (const name of ['20261111001718_nfse_individual_store.sql', '20261111001720_nfse_individual_operations.sql',
      '20261111004615_nfse_queue_operation_basis.sql', '20261111004617_nfse_operation_core_amounts.sql',
      '20261111004620_nfse_queue_preview.sql', '20261111004622_nfse_queue_operation_bridge.sql',
      '20261111030145_nfse_service_competence_rule.sql']) await db.exec(await sql(name));
    await db.exec("SET request.jwt.claims='{" + '"role":"service_role"' + "}'");
    await t.test('UTC midnight uses the fiscal day in Sao Paulo and fixed dates remain explicit', async () => {
      const resolveDate = async (definition, timestamp, override = null) =>
        (await db.query('SELECT private.resolve_nfse_service_competence($1,$2,$3) value', [definition, timestamp, override])).rows[0].value;
      assert.equal(await resolveDate(model, '2026-11-11T01:59:59Z'), '2026-11-10');
      assert.equal(await resolveDate(model, '2026-11-11T03:00:00Z'), '2026-11-11');
      assert.equal(await resolveDate({ peopleOptions: { competenceMode: 'FIXED_DATE', competenceDate: '2026-10-20' } }, '2026-11-11T03:00:00Z'), '2026-10-20');
      assert.equal(await resolveDate(model, '2026-11-11T03:00:00Z', '2026-10-21'), '2026-10-21');
      await assert.rejects(resolveDate({}, '2026-11-11T03:00:00Z'), error => error.code === '22023');
      await assert.rejects(resolveDate({ peopleOptions: { competenceMode: 'FIXED_DATE', competenceDate: '2026-02-30' } }, '2026-11-11T03:00:00Z'));
    });
    await t.test('source-only preview freezes rule-derived competence with the same creation clock and canonical description', async () => {
      row = await op(50, input);
      const dates = (await db.query("SELECT to_char(created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') fiscal_day FROM private.nfse_individual_operations WHERE id=$1", [row.previewId])).rows[0];
      assert.equal(row.snapshot.command.competenceDate, dates.fiscal_day);
      assert.equal(row.snapshot.command.serviceDate, '2026-11-10');
      assert.equal(row.snapshot.source.serviceDescription, 'DESCRIÇÃO FINAL DA PREPARAÇÃO');
      assert.equal(row.snapshot.command.amount, '1.00');
    });
    await t.test('replay precedes mutable model lookup and accepts only a matching legacy explicit date', async () => {
      await db.query("UPDATE private.nfse_models SET definition=jsonb_set(definition,'{peopleOptions,competenceDate}','\"2026-09-01\"') WHERE id=$1", [id(20)]);
      const replay = await op(50, input);
      assert.deepEqual(replay, row);
      assert.deepEqual(await op(50, { ...input, competenceDate: row.snapshot.command.competenceDate }), row);
      await assert.rejects(op(50, { ...input, competenceDate: '2026-01-01' }), error => error.code === '22023');
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_individual_operations')).rows[0].n, 1);
    });
    await t.test('a new source cannot resolve from an inactive or stale model version', async () => {
      await db.query(`INSERT INTO private.nfse_partner_services(id,polo_id,environment,partner_id,model_id,service_date,service_description,amount,partner_snapshot,model_snapshot,receivable_action,created_by)
        SELECT $1,polo_id,environment,partner_id,model_id,service_date,service_description,amount,partner_snapshot,model_snapshot,receivable_action,created_by
        FROM private.nfse_partner_services WHERE id=$2`, [id(41), id(40)]);
      const newSource = { source: { kind: 'PARTNER_SERVICE', id: id(41) } };
      await db.query('UPDATE private.nfse_models SET definition=$1 WHERE id=$2', [{ ...model, active: false }, id(20)]);
      await assert.rejects(op(51, newSource), error => error.code === '40001');
      await db.query('UPDATE private.nfse_models SET definition=$1,version=4 WHERE id=$2', [model, id(20)]);
      await assert.rejects(op(51, newSource), error => error.code === '40001');
      assert.equal((await db.query('SELECT count(*)::int n FROM private.nfse_individual_operations')).rows[0].n, 1);
      await db.query('UPDATE private.nfse_models SET version=3 WHERE id=$1', [id(20)]);
    });
    await t.test('authorization is rechecked before immutable replay and academic inputs cannot override review dates', async () => {
      await db.exec('UPDATE public.test_authorization SET allowed=false');
      await assert.rejects(op(50, input), error => error.code === '42501');
      await db.exec('UPDATE public.test_authorization SET allowed=true');
      await assert.rejects(op(51, { source: { kind: 'ACADEMIC_QUEUE', id: id(60) }, competenceDate: '2026-11-10' }), error => error.code === '22023');
      assert.equal((await db.query('SELECT count(*)::int n FROM public.contas_receber')).rows[0].n, 0);
    });
  } finally { await db.close(); }
});

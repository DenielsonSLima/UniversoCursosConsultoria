import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { clone, createDatabase, ibsDefinition, id } from './nfse_model_complete_presets.fixture.mjs';

const migrations = new URL('../migrations/', import.meta.url);
async function sql(suffix) {
  const files = (await readdir(migrations)).filter(name => name.endsWith(`_${suffix}.sql`));
  assert.equal(files.length, 1, `Exactly one migration must own ${suffix}`);
  return readFile(new URL(files[0], migrations), 'utf8');
}
function functionSource(source, name) {
  const start = source.indexOf(`CREATE FUNCTION ${name}(`);
  assert(start >= 0, `Missing function ${name}`);
  const end = source.indexOf('$function$;', start);
  assert(end > start, `Missing function terminator ${name}`);
  return source.slice(start, end + '$function$;'.length);
}
function municipalLecture() {
  const value = ibsDefinition();
  value.name = 'PALESTRA MUNICIPAL SINTÉTICA';
  value.serviceDescription = 'Palestra sintética para órgão municipal.';
  value.operationIndicatorCode = '030102';
  value.serviceOptions.governmentPurchase = true;
  value.serviceOptions.governmentEntityType = '4';
  value.serviceOptions.operationType = '1';
  value.peopleOptions = {
    version: 2, competenceMode: 'ISSUE_DATE', competenceDate: null,
    dpsSeriesMode: 'AUTOMATIC', dpsSeries: null, issuerRole: 'PROVIDER',
    simpleNationalOption: 'FROM_ESTABLISHMENT', simpleNationalAssessment: null,
    recipientSource: 'AT_ISSUANCE', recipientAddressSource: 'FROM_PARTNER',
    recipientIsDestination: true, destinationSource: null, intermediarySource: 'NONE',
  };
  value.additionalOptions.people.personalUse = false;
  value.additionalOptions.people.nif.recipient = { policy: 'FROM_PARTNER', absenceReason: null };
  value.valuesOptions.transparency = {
    ...value.valuesOptions.transparency, mode: 'SIMPLE_NATIONAL_PERCENTAGE',
    federalPercent: null, statePercent: null, municipalPercent: null, simpleNationalPercent: '12.00',
  };
  return value;
}
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);

test('administrative model creation keeps real fiscal validators and an explicit non-user audit identity', async t => {
  const db = await createDatabase();
  const definition = municipalLecture(), request = id(200);
  const create = async (value = definition, requestId = request, polo = id(1)) =>
    (await db.query('SELECT private.create_nfse_model_administrative($1,$2,$3) result',
      [requestId, polo, value])).rows[0].result;
  const counts = async () => (await db.query(`SELECT
    (SELECT count(*) FROM private.nfse_models)::integer models,
    (SELECT count(*) FROM private.nfse_model_requests)::integer requests`)).rows[0];
  try {
    await db.exec(`ALTER TABLE public.polos ADD COLUMN company_id uuid, ADD COLUMN is_matriz boolean;
      UPDATE public.polos SET company_id='${id(100)}',is_matriz=(id='${id(1)}');
      SET test.actor='';`);
    for (const suffix of ['nfse_model_people_operation_sources', 'nfse_model_operation_additional_rules',
      'nfse_model_operation_values_rules', 'nfse_model_operation_presets_save']) await db.exec(await sql(suffix));
    await db.exec(functionSource(await sql('nfse_model_matrix_management'), 'private.nfse_model_management_allowed'));
    await db.exec(await sql('nfse_external_model_admin'));
    assert.equal((await db.query('SELECT auth.uid() actor')).rows[0].actor, null,
      'The administrative call must not impersonate a portal user');
    let saved;

    await t.test('the full municipal scenario passes the real normalizers without changing its rules', async () => {
      saved = await create();
      assert.deepEqual(saved, { id: saved.id, version: 1, executionIdentity: 'MCP_ADMIN_USER_REQUEST' });
      const row = (await db.query('SELECT * FROM private.nfse_models WHERE id=$1', [saved.id])).rows[0];
      assert.equal(row.environment, 'PRODUCAO');
      assert.deepEqual(row.definition, definition);
      assert.equal(row.created_by, request); assert.equal(row.updated_by, request);
      assert.equal(row.definition.valuesOptions.iss.ratePercent, null);
      assert.equal(row.definition.valuesOptions.transparency.simpleNationalPercent, '12.00');
    });
    await t.test('replay preserves the same result and the audit identifies an administrative request', async () => {
      assert.deepEqual(await create(), saved);
      assert.deepEqual(await counts(), { models: 1, requests: 1 });
      const audit = (await db.query('SELECT * FROM private.nfse_model_requests WHERE request_id=$1', [request])).rows[0];
      assert.equal(audit.actor_id, request); assert.equal(audit.context_id, request);
      assert.equal(audit.payload.executionIdentity, 'MCP_ADMIN_USER_REQUEST');
      assert.equal(audit.payload.identitySemantics, 'ADMINISTRATIVE_REQUEST_UUID');
      assert.deepEqual(audit.payload.definition, definition); assert.deepEqual(audit.response, saved);
      await denied(create({ ...definition, name: 'INTENÇÃO DIVERGENTE' }), '40001');
    });
    await t.test('matrix authorization precedes replay and branches cannot create models', async () => {
      await denied(create(definition, id(201), id(2)), '42501');
      await db.query("UPDATE public.polos SET status='inativo' WHERE id=$1", [id(1)]);
      await denied(create(), '42501');
      await db.query("UPDATE public.polos SET status='ativo' WHERE id=$1", [id(1)]);
    });
    await t.test('fiscal normalizers reject invalid retention and official catalog codes', async () => {
      const retention = clone(definition); retention.name = 'RETENÇÃO SINTÉTICA INVÁLIDA';
      retention.valuesOptions.iss.retention = 'INTERMEDIARY';
      await denied(create(retention, id(202)), '22023');
      await denied(create({ ...definition, name: 'CÓDIGO INVÁLIDO', nationalServiceCode: '999998' }, id(203)), '22023');
      await denied(create({ ...definition, serviceDescription: 'Outra intenção' }, id(204)), '23505');
      assert.deepEqual(await counts(), { models: 1, requests: 1 });
    });
    await t.test('application roles receive no execution grant or privileged function wrapper', async () => {
      const signature = 'private.create_nfse_model_administrative(uuid,uuid,jsonb)';
      for (const role of ['authenticated', 'anon', 'service_role']) {
        assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',
          [role, signature])).rows[0].allowed, false, role);
      }
      const properties = (await db.query(`SELECT prosecdef,proconfig FROM pg_proc
        WHERE oid=$1::regprocedure`, [signature])).rows[0];
      assert.equal(properties.prosecdef, false, 'Administrative helper must remain SECURITY INVOKER');
      assert(properties.proconfig.includes('search_path=""'));
    });
  } finally { await db.close(); }
});

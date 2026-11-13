import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const { PGlite } = await import(pathToFileURL(resolve(process.env.NFSE_TEST_PGLITE_MODULE)).href);
const sql = async name => {
  const suffix = name.replace(/^[0-9]+_/, '');
  const matches = (await readdir(new URL('../migrations/', import.meta.url))).filter(file => file.endsWith(`_${suffix}`));
  assert.equal(matches.length, 1, `Unique migration source for ${suffix}`);
  return readFile(new URL(`../migrations/${matches[0]}`, import.meta.url), 'utf8');
};
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const denied = (promise, code) => assert.rejects(promise, error => error.code === code);
const issuer = '00000000000191', recipient = '00000000000272';
const key = `280340122${issuer}000000000000000000000000001`;
const xml = Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS${key}">
<nNFSe>1</nNFSe><cStat>100</cStat><dhProc>2026-11-10T16:59:53-03:00</dhProc>
<emit><CNPJ>${issuer}</CNPJ><xNome>EMITENTE SINTÉTICO</xNome></emit><valores><vLiq>1000.00</vLiq></valores>
<DPS><infDPS Id="DPS-SINTETICA"><tpAmb>1</tpAmb><dhEmi>2026-11-10T16:59:52-03:00</dhEmi>
<serie>70000</serie><nDPS>5</nDPS><dCompet>2026-11-10</dCompet><prest><CNPJ>${issuer}</CNPJ></prest>
<toma><CNPJ>${recipient}</CNPJ><xNome>TOMADOR SINTÉTICO</xNome></toma>
<serv><cServ><cTribNac>080201</cTribNac><xDescServ>PALESTRA SINTÉTICA &amp; EDUCAÇÃO</xDescServ><cNBS>122051900</cNBS></cServ></serv>
<valores><vServPrest><vServ>1000.00</vServ></vServPrest></valores>
<IBSCBS><cIndOp>030102</cIndOp></IBSCBS></infDPS></DPS></infNFSe></NFSe>`);
const pdf = Buffer.from('%PDF-1.7\nSYNTHETIC ORIGINAL PDF\n%%EOF');

test('external administrative NFS-e import preserves evidence without fiscal dispatch or financial writes', async t => {
  const db = new PGlite();
  let imported;
  const call = async (request = id(50), document = xml, originalPdf = pdf, polo = id(1), model = id(20), partner = id(30)) =>
    (await db.query('SELECT private.import_nfse_external_document($1,$2,$3,$4,$5,$6) value',
      [request, polo, model, partner, document, originalPdf])).rows[0].value;
  try {
    await db.exec(`CREATE SCHEMA private; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.polos(id uuid PRIMARY KEY,cnpj text,is_matriz boolean,status text);
      CREATE TABLE public.parceiros(id uuid PRIMARY KEY,cpf_cnpj text,tipo text,status text,polo_id uuid,polo_ids uuid[]);
      CREATE TABLE private.nfse_models(id uuid PRIMARY KEY,polo_id uuid,environment text,definition jsonb,version integer);
      CREATE TABLE private.nfse_partner_services(id uuid PRIMARY KEY,polo_id uuid,environment text,partner_id uuid,model_id uuid,
        service_date date,service_description text,amount numeric(14,2),partner_snapshot jsonb,model_snapshot jsonb,
        receivable_id uuid,receivable_action text,created_by uuid,status text DEFAULT 'PREPARADO',created_at timestamptz DEFAULT now(),
        CHECK(receivable_action='NONE' AND receivable_id IS NULL));
      CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,actor_id uuid,context_id uuid,polo_id uuid,environment text,
        month text,request_id uuid,command jsonb,snapshot jsonb,configuration_version integer,certificate_fingerprint text,
        state text,result jsonb,authorized_xml text,UNIQUE(actor_id,request_id));
      CREATE TABLE private.nfse_individual_cancellations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),operation_id uuid);
      CREATE TABLE private.nfse_queue_operation_links(source_kind text,source_id uuid,operation_id uuid,basis jsonb,basis_fingerprint text);
      CREATE VIEW private.nfse_operation_source_projection AS SELECT o.id operation_id,o.request_id,l.source_kind,l.source_id,
        NULL::uuid cancel_preview_id,o.state,o.result->>'number' number,o.result->>'accessKey' access_key,o.result->>'message' message
        FROM private.nfse_individual_operations o JOIN private.nfse_queue_operation_links l ON l.operation_id=o.id;
      CREATE FUNCTION private.reject_nfse_preparation_change() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        RAISE EXCEPTION 'immutable' USING ERRCODE='55000'; END$$;
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ATIVO'$$;
      CREATE FUNCTION private.nfse_model_management_allowed(uuid) RETURNS boolean LANGUAGE sql STABLE AS
        $$SELECT EXISTS(SELECT 1 FROM public.polos WHERE id=$1 AND is_matriz AND status='ATIVO')$$;
      CREATE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text) RETURNS void LANGUAGE plpgsql AS $$BEGIN
        IF $2<>'${id(1)}'::uuid THEN RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF; END$$;
      CREATE FUNCTION private.nfse_partner_service_removable(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT false$$;
      CREATE TABLE private.nfse_partner_service_removals(service_id uuid);
      CREATE TABLE private.nfse_confirmed_cancellations(operation_id uuid);
      CREATE TABLE public.contas_receber(id uuid); CREATE TABLE public.financial_payment_events(id uuid);`);
    await db.query("INSERT INTO public.polos VALUES($1,$2,true,'ATIVO'),($3,$2,false,'ATIVO')", [id(1), issuer, id(2)]);
    await db.query("INSERT INTO public.parceiros VALUES($1,$2,'PJ','ATIVO',$3,NULL)", [id(30), recipient, id(1)]);
    const definition = { name: 'MODELO SINTÉTICO', active: true, nationalServiceCode: '080201', nbsCode: '122051900', operationIndicatorCode: '030102' };
    await db.query("INSERT INTO private.nfse_models VALUES($1,$2,'PRODUCAO',$3,1)", [id(20), id(1), definition]);
    const migration = await sql('20261112023000_nfse_external_document_import.sql');
    assert(migration.split('\n').length <= 500);
    await db.exec(migration);
    const preparationSource = await sql('20261112023002_nfse_external_import_preparation_reads.sql');
    const previousSource = await sql('20261111114000_nfse_services_cancelled_partition.sql');
    const functionBody = source => source.match(/AS \$function\$([\s\S]*?)\$function\$/)[1];
    assert.equal(functionBody(preparationSource).replace(/^.*AND NOT EXISTS\(SELECT 1 FROM private\.nfse_external_imports.*\n/m, ''),
      functionBody(previousSource), 'Preserve the complete current read body except the external-import predicate');
    await db.exec(preparationSource);
    await t.test('strict XML parsing rejects DTD, foreign environment, duplicate invoice and mismatched issuer/key', async () => {
      for (const source of [xml.toString().replace('<NFSe ', '<!DOCTYPE NFSe><NFSe '),
        xml.toString().replace('<tpAmb>1</tpAmb>', '<tpAmb>2</tpAmb>'),
        xml.toString().replace('</NFSe>', xml.toString().match(/<infNFSe[\s\S]*<\/infNFSe>/)[0] + '</NFSe>'),
        xml.toString().replace(`<emit><CNPJ>${issuer}`, `<emit><CNPJ>${recipient}`)]) {
        await denied(db.query('SELECT private.nfse_external_document_facts($1)', [Buffer.from(source)]), '22023');
      }
      const facts = (await db.query('SELECT private.nfse_external_document_facts($1) value', [xml])).rows[0].value;
      assert.equal(facts.access_key, key); assert.equal(facts.amount, '1000.00');
      assert.equal(facts.description, 'PALESTRA SINTÉTICA & EDUCAÇÃO');
      assert.equal(facts.emission_month, '2026-11'); assert.equal(facts.signature_validation, 'NOT_PERFORMED');
    });
    await t.test('import fails before any write for branch, wrong payer/model and invalid PDF', async () => {
      await denied(call(id(51), xml, pdf, id(2)), '42501');
      await denied(call(id(51), xml, pdf, id(1), id(21)), '22023');
      await denied(call(id(51), xml, pdf, id(1), id(20), id(31)), '22023');
      await denied(call(id(51), xml, Buffer.from('NOT A PDF')), '22023');
      assert.equal((await db.query('SELECT count(*)::integer value FROM private.nfse_individual_operations')).rows[0].value, 0);
    });
    await t.test('one import retains byte-exact files and original DPS, detached from new money or transmission', async () => {
      imported = await call(); assert.equal(imported.imported, true);
      assert.equal(imported.xmlSha256, hash(xml)); assert.equal(imported.pdfSha256, hash(pdf));
      const evidence = (await db.query('SELECT * FROM private.nfse_external_imports')).rows[0];
      assert.deepEqual(Buffer.from(evidence.xml_bytes), xml); assert.deepEqual(Buffer.from(evidence.pdf_bytes), pdf);
      const op = (await db.query('SELECT * FROM private.nfse_individual_operations')).rows[0];
      assert.equal(op.authorized_xml, xml.toString()); assert.equal(op.state, 'AUTHORIZED');
      assert.equal(op.actor_id, id(50)); assert.equal(op.context_id, id(50));
      assert.equal(op.snapshot.externalImport.fiscalTransmission, false); assert.equal(op.snapshot.externalImport.originalDpsSeries, '70000');
      const service = (await db.query('SELECT * FROM private.nfse_partner_services')).rows[0];
      assert.equal(service.receivable_action, 'NONE'); assert.equal(service.receivable_id, null);
      assert.equal((await db.query('SELECT count(*)::integer value FROM public.contas_receber')).rows[0].value, 0);
      assert.equal((await db.query('SELECT count(*)::integer value FROM public.financial_payment_events')).rows[0].value, 0);
    });
    await t.test('replay and same bytes/key never duplicate; changed original evidence is rejected', async () => {
      for (const request of [id(50), id(52)]) {
        const replay = await call(request); assert.equal(replay.id, imported.id); assert.equal(replay.imported, false);
      }
      await denied(call(id(50), Buffer.concat([xml, Buffer.from('\n')])), '40001');
      await denied(call(id(50), xml, Buffer.concat([pdf, Buffer.from('\n')])), '40001');
      assert.equal((await db.query('SELECT count(*)::integer value FROM private.nfse_external_imports')).rows[0].value, 1);
    });
    await t.test('one request cannot replay a second existing document through its access key', async () => {
      const secondXml = Buffer.from(xml.toString().replace(key, key.slice(0, -1) + '2'));
      const second = await call(id(53), secondXml); assert.equal(second.imported, true);
      await denied(call(id(53), xml), '40001');
    });
    await t.test('preparation reads exclude imported rows before filters, totals and pagination but retain normal issued services', async () => {
      await db.query(`INSERT INTO private.nfse_partner_services
        SELECT $1,polo_id,environment,partner_id,model_id,service_date,service_description,20.00,partner_snapshot,
          model_snapshot,receivable_id,receivable_action,created_by,status,created_at FROM private.nfse_partner_services WHERE id=$2`,
      [id(70), imported.serviceId]);
      await db.query(`INSERT INTO private.nfse_individual_operations(id,state,result)
        VALUES($1,'AUTHORIZED',$2)`, [id(71), { number: '99', accessKey: '9'.repeat(50) }]);
      await db.query("INSERT INTO private.nfse_queue_operation_links(source_kind,source_id,operation_id) VALUES('PARTNER_SERVICE',$1,$2)", [id(70), id(71)]);
      await db.query(`INSERT INTO private.nfse_partner_services
        SELECT $1,polo_id,environment,partner_id,model_id,service_date,service_description,30.00,partner_snapshot,
          model_snapshot,receivable_id,receivable_action,created_by,status,created_at FROM private.nfse_partner_services WHERE id=$2`,
      [id(72), imported.serviceId]);
      await db.query("INSERT INTO private.nfse_individual_operations(id,state) VALUES($1,'AUTHORIZED')", [id(73)]);
      await db.query("INSERT INTO private.nfse_queue_operation_links(source_kind,source_id,operation_id) VALUES('PARTNER_SERVICE',$1,$2)", [id(72), id(73)]);
      await db.query('INSERT INTO private.nfse_confirmed_cancellations VALUES($1)', [id(73)]);
      const read = async (search = null, from = null, to = null, type = null, page = 1) =>
        (await db.query('SELECT public.get_nfse_partner_services_v2_secure($1,$2,$3,$4,$5,1,$6,$7,$8,$9) value',
          [id(10), id(1), 'PRODUCAO', '2026-11', page, search, from, to, type])).rows[0].value.data;
      for (const args of [[], ['PALESTRA'], [recipient], ['99'], [null, '2026-11-10', '2026-11-10', 'PJ']]) {
        const result = await read(...args); assert.equal(result.totalItems, 1); assert.equal(result.totalAmount, '20.00');
        assert.equal(result.rows[0].id, id(70)); assert.equal(result.rows[0].operationId, id(71));
        assert.equal(result.rows[0].state, 'AUTHORIZED');
      }
      assert.equal((await read(null, null, null, 'PF')).totalItems, 0);
      const next = await read(null, null, null, null, 2); assert.equal(next.rows.length, 0); assert.equal(next.totalItems, 1);
    });
    await t.test('imported operations expose document identity for reading but block interactive fiscal mutation', async () => {
      const projection = (await db.query("SELECT private.nfse_operation_fields('PARTNER_SERVICE',$1) value", [imported.serviceId])).rows[0].value;
      assert.equal(projection.operationId, null); assert.equal(projection.sourceId, null);
      assert.equal(projection.number, '1'); assert.equal(projection.accessKey, key); assert.equal(projection.state, 'AUTHORIZED');
      await denied(db.query('INSERT INTO private.nfse_individual_cancellations(operation_id) VALUES($1)', [imported.id]), '55000');
      await denied(db.query("UPDATE private.nfse_individual_operations SET state='PROCESSING' WHERE id=$1", [imported.id]), '55000');
      await denied(db.query('DELETE FROM private.nfse_external_imports WHERE operation_id=$1', [imported.id]), '55000');
      await db.query("INSERT INTO private.nfse_individual_operations(id,state) VALUES($1,'PREVIEWED')", [id(90)]);
      await db.query('DELETE FROM private.nfse_individual_operations WHERE id=$1', [id(90)]);
      assert.equal((await db.query('SELECT count(*)::integer value FROM private.nfse_individual_operations WHERE id=$1', [id(90)])).rows[0].value, 0);
    });
    await t.test('application roles cannot call importer or read original private files', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        assert.equal((await db.query("SELECT has_function_privilege($1,'private.import_nfse_external_document(uuid,uuid,uuid,uuid,bytea,bytea)','execute') value", [role])).rows[0].value, false);
        assert.equal((await db.query("SELECT has_table_privilege($1,'private.nfse_external_imports','select') value", [role])).rows[0].value, false);
      }
    });
  } finally { await db.close(); }
});

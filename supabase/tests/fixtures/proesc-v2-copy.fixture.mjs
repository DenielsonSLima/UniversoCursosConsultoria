import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createFixture } from './proesc-v2-growth.fixture.mjs';

export async function createCopyFixture(options = {}) {
  const f = await createFixture(options);
  await f.db.exec(readFileSync(new URL('../../migrations/20261009224423_prepare_proesc_v2_payload_storage_off.sql', import.meta.url), 'utf8'));
  await f.db.exec(readFileSync(new URL('../../migrations/20261009224508_validate_proesc_v2_payload_constraints_off.sql', import.meta.url), 'utf8'));
  await installCopyDraft(f.db);
  const run = f.id(3000), task = f.id(3001);
  await f.db.query(`INSERT INTO internal_proesc.v2_runs(id,actor_id,credential_revision,mode,status,created_at,finished_at)
    VALUES($1,$2,$3,'FULL','COMPLETE','2026-09-01Z','2026-09-02Z')`, [run, f.actor, f.revision]);
  await f.db.query(`INSERT INTO internal_proesc.v2_tasks(id,run_id,resource,unit_id,source_year,source_month,status)
    VALUES($1,$2,'invoices','3145',2026,9,'COMPLETE')`, [task, run]);
  const observationIds = [];
  for (let n = 0; n < 3; n++) {
    const obs = f.id(3010 + n), invoice = String(901 + n);
    const raw = `{"unitId":"3145","invoiceId":"${invoice}","principalCents":9007199254740993,
      "precise":1234567890.12345678901234567890,"zero":0,"nullValue":null,"array":[2,1]}`;
    let canonical = null;
    if (n === 1) canonical = (await f.db.query('SELECT internal_proesc.v2_intern_invoice_payload($1,$2,$3::jsonb) id', ['3145', invoice, raw])).rows[0].id;
    await f.db.query(`INSERT INTO internal_proesc.v2_invoice_observations
      (id,run_id,task_id,unit_id,invoice_id,source_status,normalized,normalized_payload_id,result,observed_at)
      VALUES($1,$2,$3,'3145',$4,'EM ABERTO',$5::jsonb,$6,'UNLINKED','2026-09-01Z')`,
    [obs, run, task, invoice, canonical ? null : raw, canonical]);
    observationIds.push(obs);
  }
  const scalar = async (sql, params = []) => (await f.db.query(sql, params)).rows[0].value;
  return { ...f, run, task, observationIds, scalar };
}

export async function installCopyDraft(db) {
  await installCopyAuthorizerFixture(db);
  const applied = readFileSync(new URL('../../migrations/20261010112854_prepare_proesc_v2_copy_only_catalog.sql', import.meta.url), 'utf8');
  const draft = readFileSync(new URL('../../review-drafts/proesc-v2-growth/05_copy_only_catalog.draft.sql', import.meta.url), 'utf8');
  if (applied !== draft || createHash('sha256').update(applied).digest('hex')
    !== 'eae553eec2a5c91af98c9ba223fbcdf89bfbe1a3d2b141702aea34c1a1c0887f') {
    throw new Error('Applied copy-only migration bytes must remain immutable');
  }
  await db.exec(applied);
}

export async function installCopyAuthorizerFixture(db) {
  // Exact existing guard body read from the production catalog, without its secret-bearing callers.
  await db.exec(`CREATE FUNCTION internal_proesc.require_receipt_archive_service()
    RETURNS void LANGUAGE plpgsql SET search_path='' AS $function$
BEGIN
  IF coalesce(current_setting('request.jwt.claims',true),'{}')::jsonb->>'role'
    IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Acesso interno ao arquivo Proesc não autorizado.' USING ERRCODE='42501';
  END IF;
END;
$function$; REVOKE ALL ON FUNCTION internal_proesc.require_receipt_archive_service() FROM PUBLIC,anon,authenticated;`);
}

export function syntheticCopyReceipt(source) {
  const compressedSha256 = 'a'.repeat(64), manifestJsonSha256 = 'b'.repeat(64), manifestCompressedSha256 = 'c'.repeat(64);
  return { format: 'proesc-v2-copy-receipt-v1', batchId: source.batchId,
    payloadSha256: source.payloadSha256, rawBytes: source.rawBytes, rowCount: source.rowCount,
    objectName: `${source.batchId}.${compressedSha256}.jsonl.gz`, compressedSha256, compressedBytes: 600,
    manifestObjectName: `${source.batchId}.${manifestCompressedSha256}.manifest.json.gz`,
    manifestJsonSha256, manifestJsonBytes: 900, manifestCompressedSha256, manifestCompressedBytes: 400,
    storageScope: { projectRef: source.projectRef, bucket: source.bucket, namespace: source.namespace,
      tenantId: source.tenantId, prefix: `${source.namespace}/${source.tenantId}` }, copyOnly: true };
}

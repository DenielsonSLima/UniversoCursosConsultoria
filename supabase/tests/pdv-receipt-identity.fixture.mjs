import { readFileSync } from 'node:fs';
import { createPdvFixture, uid, polo } from './pdv-printing.fixture.mjs';

export const identityMigration = '20260927024600_enrich_pdv_receipt_payer_identity.sql';
export async function createIdentityFixture() {
  const f = await createPdvFixture();
  await f.db.exec(`
    ALTER TABLE public.parceiros ADD COLUMN tipo text, ADD COLUMN matricula_acesso text;
    CREATE TABLE public.banese_pdv_cancellation_jobs(
      receivable_id uuid PRIMARY KEY,replacement_request_id uuid,state text,
      confirmed_at timestamptz,evidence_sha256 text,snapshot jsonb
    );
  `);
  await f.db.query(`UPDATE public.parceiros SET nome='Aluno sintético',cpf_cnpj='12345678345',
    tipo='Aluno',matricula_acesso='UNIV-A-00001234' WHERE id=$1`, [uid(700)]);
  await f.db.query('INSERT INTO public.parceiros VALUES($1,$2,$3,$4,$5)',
    [uid(701), 'Empresa sintética', '12345678000345', 'Empresa', 'UNIV-A-99999999']);
  await f.db.query('INSERT INTO public.parceiros VALUES($1,$2,$3,$4,$5)',
    [uid(702), 'Aluno sintético divergente', '12345678345', 'Aluno', 'UNIV-A-00005678']);
  const addPaid = (n, payer = uid(700)) => f.db.query(`INSERT INTO public.contas_receber
    SELECT * FROM jsonb_populate_record(NULL::public.contas_receber,
      (SELECT to_jsonb(c) FROM public.contas_receber c WHERE id=$1)
        ||jsonb_build_object('id',$2::text,'cliente_id',$3::text,'gateway_payment_id',$4::text))`,
  [uid(1), uid(n), payer, `synthetic-${n}`]);
  for (const n of [17, 18, 19, 20, 21]) await addPaid(n, n === 18 ? uid(702) : uid(700));
  await addPaid(22, uid(701));
  const old = {};
  for (const n of [1, 12, 13, 14, 15, 16, 17, 18]) old[n] = await f.receipt(uid(n));
  const proof = async (n, changes = {}) => {
    const original = uid(100 + n);
    const value = { receivable_id: original, replacement_request_id: uid(n), state: 'CANCELED',
      confirmed_at: '2026-09-26T00:00:00Z', evidence_sha256: 'a'.repeat(64),
      snapshot: { id: original, cliente_id: uid(n === 18 ? 702 : 700), polo_id: polo }, ...changes };
    await f.db.query(`INSERT INTO public.banese_pdv_cancellation_jobs
      SELECT * FROM jsonb_populate_record(NULL::public.banese_pdv_cancellation_jobs,$1::jsonb)`, [value]);
  };
  await proof(1);
  await proof(13, { state: 'FENCED' });
  await proof(14, { confirmed_at: '2099-01-01T00:00:00Z' });
  await proof(15, { snapshot: { id: uid(115), cliente_id: uid(700), polo_id: uid(901) } });
  await proof(16, { snapshot: { id: uid(116), cliente_id: uid(701), polo_id: polo } });
  await proof(17);
  // Deliberately omit the production unique key to exercise conservative handling
  // if an imported/corrupt source contains two otherwise matching origin records.
  await proof(17, { receivable_id: uid(217), snapshot: { id: uid(217), cliente_id: uid(700), polo_id: polo } });
  await proof(18);
  await f.db.query('UPDATE public.parceiros SET cpf_cnpj=$1 WHERE id=$2', ['98765432100', uid(702)]);
  const oldJob = await f.prepare(old[1].id);
  const oldClaim = await f.claim(oldJob.id);
  await f.complete(oldJob.id, oldClaim.token, 'DIALOG_CLOSED');
  const oldReceiptIds = Object.values(old).map(r => r.id);
  const receiptsHash = () => f.scalar(`SELECT md5(jsonb_agg(r ORDER BY id)::text) result
    FROM internal_pdv.receipts r WHERE id=ANY($1::uuid[])`, [oldReceiptIds]);
  const jobHash = () => f.scalar('SELECT md5(to_jsonb(j)::text) result FROM internal_pdv.print_jobs j WHERE id=$1', [oldJob.id]);
  const metadata = () => f.db.query(`SELECT oid,proname,proowner,prosecdef,provolatile,proconfig,proacl
    FROM pg_proc WHERE oid IN('public.prepare_pdv_receipt(uuid,uuid,uuid)'::regprocedure,
      'internal_pdv.receipt_dto(internal_pdv.receipts,uuid,uuid)'::regprocedure) ORDER BY oid`);
  const before = { financial: await f.fingerprint(), receipts: await receiptsHash(), job: await jobHash(),
    metadata: (await metadata()).rows };
  const apply = () => f.db.exec(readFileSync(new URL(`../migrations/${identityMigration}`, import.meta.url), 'utf8'));
  return { ...f, old, oldJob, before, receiptsHash, jobHash, metadata, apply };
}

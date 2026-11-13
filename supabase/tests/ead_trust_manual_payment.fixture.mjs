import {newTrustCertificateDatabase,source,scalar,id,unit} from './ead_trust_certificate.fixture.mjs';
export * from './ead_trust_certificate.fixture.mjs';
export const manualMigration='20261112225925_ead_trust_manual_payment_projection.sql';
export async function manualDatabase(options={}){
 const db=await newTrustCertificateDatabase(options);
 // Use the actual ledger projection owner. Only unrelated read dependencies
 // absent from the academic fixture are added; no academic/payment guard is mocked.
 await db.exec(`ALTER TABLE public.financial_payment_events ADD COLUMN payment_date date DEFAULT CURRENT_DATE,
  ADD COLUMN created_at timestamptz DEFAULT now();
  ALTER TABLE public.contas_receber ADD COLUMN conta_bancaria_id uuid;
  CREATE TABLE public.financial_payment_components(event_id uuid,sequence integer,account_id uuid,method text,amount_cents bigint);`);
 const ledger=await source('20261014183509_financial_payment_append.sql');
 const owner=ledger.slice(ledger.indexOf('CREATE FUNCTION internal_financial_payments.refresh_source('),
  ledger.indexOf('CREATE FUNCTION internal_financial_payments.append_payment('));
 await db.exec('CREATE SCHEMA IF NOT EXISTS internal_financial_payments');
 await db.exec(owner);
 return db;
}
export async function settleTrustManual(db,{receivableId=id(1),eventId=id(901),principalCents=10000,
 paymentCents=10000,discountCents=0,reversed=false,poloId=unit}={}){
 await db.exec('BEGIN');
 try{
  await db.query("UPDATE public.contas_receber SET gateway_status='CANCELED' WHERE id=$1",[receivableId]);
  await db.query("UPDATE public.payment_gateway_transactions SET remote_status='CANCELED' WHERE receivable_id=$1",[receivableId]);
  await db.query(`INSERT INTO public.financial_payment_events(id,source_kind,source_id,polo_id,
   original_cents,principal_cents,discount_cents,payment_cents,reversed_at)
   VALUES($1,'RECEIVABLE',$2,$3,10000,$4,$5,$6,CASE WHEN $7 THEN now() END)`,
   [eventId,receivableId,poloId,principalCents,discountCents,paymentCents,reversed]);
  await scalar(db,"SELECT internal_financial_payments.refresh_source('RECEIVABLE',$1) value",[receivableId]);
  await db.exec('COMMIT');
 }catch(error){await db.exec('ROLLBACK');throw error;}
}

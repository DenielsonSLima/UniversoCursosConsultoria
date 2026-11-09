import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const read = file => readFile(new URL(file,import.meta.url),'utf8');
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('snapshot do recibo transporta parceiro/turma e mantém configuração institucional e autorização',async t=>{
 const db=new PGlite();
 const receipt=async()=> (await db.query('select public.preparar_recibo_despesa_secure($1) snapshot',[id(40)])).rows[0].snapshot;
 try {
  await db.exec(await read('./expense_clone_payment.fixture.sql'));
  await db.exec(await read('./expense_receipt.fixture.sql'));
  await db.exec(await read('../migrations/20261109031600_expense_receipt_partner_signature.sql'));
  await db.exec(`set test.actor='${id(99)}';set test.role='authenticated';set test.allowed='yes';`);
  await t.test('parceiro real e turma autorizada atravessam o snapshot',async()=>{
   const s=await receipt();
   assert.equal(s.receipt.parceiroVinculado,true);
   assert.equal(s.receipt.fornecedorNome,'PARCEIRO DEMONSTRAÇÃO');
   assert.equal(s.receipt.fornecedorDocumento,'00000000000');
   assert.equal(s.receipt.turmaNome,'ENFERMAGEM INTEGRAL');
   assert.equal(s.receipt.turmaCodigo,'ENF T-42 INT');
   assert.equal(s.receipt.valor,330);
   assert.deepEqual([s.polo.watermark_url,s.polo.watermark_opacity,s.polo.watermark_scale,s.polo.watermark_rotate],
    ['https://example.invalid/marca.png',0.18,82,false]);
   assert.equal(s.polo.logoUrl,'https://example.invalid/logo.png');
  });
  await t.test('documento ausente não remove assinatura de parceiro; sem vínculo não inventa assinatura/turma',async()=>{
   await db.exec('update parceiros set cpf_cnpj=null;');
   assert.equal((await receipt()).receipt.parceiroVinculado,true);
   await db.exec('update despesas_lancamentos set fornecedor_id=null,turma_id=null;');
   const s=await receipt();
   assert.equal(s.receipt.parceiroVinculado,false);
   assert.equal(s.receipt.fornecedorNome,null);
   assert.equal(s.receipt.turmaNome,null);
   assert.equal(s.receipt.turmaCodigo,null);
  });
  await t.test('referência de turma de outro polo não expõe seus dados',async()=>{
   await db.query('update despesas_lancamentos set turma_id=$1',[id(31)]);
   const s=await receipt();
   assert.equal(s.receipt.turmaNome,null);assert.equal(s.receipt.turmaCodigo,null);
  });
  await t.test('nega perfil sem aba, sem identidade e despesa cancelada',async()=>{
   await db.exec("set test.allowed='no';");
   await assert.rejects(receipt(),/não autorizado/);
   await db.exec("set test.role='';");
   await assert.rejects(receipt(),/não autorizado/);
   await db.exec("set test.actor=''; set test.role='';");
   await assert.rejects(receipt(),/Autenticação obrigatória/);
   await db.exec(`set test.actor='${id(99)}';set test.role='authenticated';set test.allowed='yes';update despesas_lancamentos set status='CANCELADO';`);
   await assert.rejects(receipt(),/status atual/);
  });
 } finally {await db.close();}
});

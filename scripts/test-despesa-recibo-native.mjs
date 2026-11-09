import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(resolve(root,path),'utf8');
await mkdir(join(root,'tmp'),{recursive:true});
const temporary=await mkdtemp(join(root,'tmp','receipt-native-'));
const modelPath='modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPreview.tsx';
const pdfPath='modules/gestor/financeiro/despesas/components/despesa-recibo.pdf.ts';
try {
 const [pdfSource,modal,model,rpc]=await Promise.all([read(pdfPath),
  read('modules/gestor/financeiro/despesas/components/DespesaReciboModal.tsx'),read(modelPath),
  read('supabase/migrations/20261109031600_expense_receipt_partner_signature.sql')]);
 assert.match(modal,/\.\.\.snapshot\.receipt/);
 assert.match(modal,/\.\.\.snapshot\.polo/);
 assert.match(modal,/createPdf=\{createDespesaReciboPdf\}/);
 for(const key of ['watermark_url','watermark_opacity','watermark_scale','watermark_rotate']) {
  assert.ok(rpc.includes(`'${key}', polo.${key}`));assert.ok(pdfSource.includes(`polo.${key}`));
 }
 assert.match(pdfSource,/drawCanonicalInstitutionalHeader/);
 assert.doesNotMatch(pdfSource,/html2canvas|canvas|toDataURL|buildSelectablePdfBlobFromElements/);
 assert.match(rpc,/'parceiroVinculado', despesa.fornecedor_id IS NOT NULL/);
 assert.match(rpc,/'turmaNome', turma.nome/);assert.match(rpc,/'turmaCodigo', turma.codigo/);
 assert.match(model,/parceiroVinculado: Boolean\(item.fornecedorId\)/);
 const outfile=join(temporary,'renderer.cjs');
 await build({stdin:{contents:`export {createDespesaReciboPdf} from './${pdfPath}';\nexport {despesaToReciboData,printReciboDespesa,default as Model} from './${modelPath}';`,resolveDir:root},
  outfile,bundle:true,platform:'node',format:'cjs',packages:'external',define:{'import.meta.env':'{}'},
  plugins:[{name:'offline-fixture',setup(b){
   b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'fixture'}));
   b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const supabase=new Proxy({}, {get(){throw new Error('Teste offline: rede não permitida');}});"}));
   b.onResolve({filter:/^dompurify$/},()=>({path:'dompurify',namespace:'fixture-dom'}));
   b.onLoad({filter:/.*/,namespace:'fixture-dom'},()=>({contents:'export default {addHook(){},sanitize:v=>v};'}));
  }}]});
 const {createDespesaReciboPdf,despesaToReciboData,printReciboDespesa,Model}=createRequire(import.meta.url)(outfile);
 const React=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');
 const logo=await readFile(resolve(root,'public/LogoUniverso.png'));
 const configured=process.env.RECEIPT_WATERMARK_FIXTURE ? JSON.parse(await readFile(process.env.RECEIPT_WATERMARK_FIXTURE,'utf8')) : null;
 const polo={id:'polo-demo',nome:'UNIVERSO CURSOS E CONSULTORIA',nomeFantasia:'UNIVERSO CURSOS E CONSULTORIA',
  status:'ativo',is_matriz:true,cidade:'JAPOATÃ',estado:'SE',cnpj:'00000000000000',
  logoUrl:`data:image/png;base64,${logo.toString('base64')}`,watermark_url:configured?.watermark_url || `data:image/png;base64,${logo.toString('base64')}`,
  watermark_opacity:Number(configured?.watermark_opacity ?? 0.08),watermark_scale:configured?.watermark_scale ?? 65,watermark_rotate:configured?.watermark_rotate ?? false};
 const receipt={lancamentoId:'demo-1234',descricao:'PRESTAÇÃO DE SERVIÇOS AULA TEÓRICA',valor:330,valorPago:330,
  dataLancamento:'2026-11-07',dataVencimento:'2026-11-07',dataPagamento:'2026-11-07',
  fornecedorNome:'PARCEIRO DEMONSTRAÇÃO',parceiroVinculado:true,categoriaNome:'AULA TEÓRICA',
  turmaNome:'ENFERMAGEM INTEGRAL',turmaCodigo:'ENF T-42 INT',status:'PAGO',formaPagamento:'PIX',
  contaBancariaNome:'BANCO DEMONSTRAÇÃO · Ag. 0001 · Conta 00000-0',parcelaNumero:1,totalParcelas:1,poloId:polo.id};
 const longName='PARCEIRO DEMONSTRAÇÃO DE SERVIÇOS EDUCACIONAIS E CONSULTORIA TÉCNICA COM NOME EMPRESARIAL EXTENSO LTDA';
 const cases=[['com-parceiro',receipt],['sem-parceiro',{...receipt,parceiroVinculado:false,fornecedorNome:undefined,turmaNome:undefined,turmaCodigo:undefined}],
  ['nome-longo',{...receipt,fornecedorNome:longName,turmaNome:'TÉCNICO EM ENFERMAGEM INTEGRAL - UNIDADE DEMONSTRAÇÃO',observacao:'OBSERVAÇÃO DE DEMONSTRAÇÃO COM DETALHAMENTO DO SERVIÇO E CONFERÊNCIA DE ESPAÇAMENTO. '.repeat(3)}],
  ['pendente',{...receipt,status:'PENDENTE',dataPagamento:undefined,valorPago:undefined}]];
 for(const [name,data] of cases) {
  const result=await createDespesaReciboPdf([{emissionId:'demo1234',recibo:data,poloSnapshot:polo}]);
  assert.equal(result.blob.type,'application/pdf');
  const task=getDocument({data:new Uint8Array(await result.blob.arrayBuffer()),disableFontFace:true,useSystemFonts:true});
  const document=await task.promise;
  assert.equal(document.numPages,1);
  const page=await document.getPage(1);const content=await page.getTextContent();
  const text=content.items.map(i=>i.str||'').join(' ');
  assert.ok(text.includes('RESPONSÁVEL FINANCEIRO'));
  assert.equal(text.includes('ASSINATURA DO PARCEIRO'),data.parceiroVinculado);
  assert.equal(text.includes('TURMA VINCULADA'),Boolean(data.turmaCodigo));
  if(data.turmaCodigo) {assert.ok(text.includes(data.turmaCodigo));assert.ok(text.includes(data.turmaNome));}
  const lineLabel=content.items.find(i=>i.str==='ASSINATURA DO PARCEIRO');
  if(lineLabel) {
   const nameParts=content.items.filter(i=>i.transform[4]<280&&i.transform[5]<lineLabel.transform[5]+36&&i.transform[5]>lineLabel.transform[5]+3).map(i=>i.str).join(' ');
   assert.ok(nameParts.includes(data.fornecedorNome),nameParts);
   assert.ok(lineLabel.transform[5]>35,'Assinatura fica acima do rodapé.');
  }
  assert.ok(!text.includes('…'),'O recibo compacto não elimina conteúdo com reticências.');
  if(data.observacao) {
   const obs=content.items.find(i=>i.str==='OBSERVAÇÃO');
   assert.ok(obs.transform[5]>140,'Observação fica acima da cidade e assinaturas.');
  }
  const ops=await page.getOperatorList();
  assert.ok(ops.fnArray.includes(OPS.showText),'Texto do recibo continua vetorial.');
  assert.ok(ops.fnArray.includes(OPS.paintImageXObject),'Logo/marca continuam recursos isolados.');
  if(process.env.RECEIPT_PDF_OUTPUT) {
   await mkdir(process.env.RECEIPT_PDF_OUTPUT,{recursive:true});
   await writeFile(join(process.env.RECEIPT_PDF_OUTPUT,`${name}.pdf`),new Uint8Array(await result.blob.arrayBuffer()));
  }
  await task.destroy();
 }
 const data=despesaToReciboData({id:'demo',fornecedorId:'parceiro',turmaNome:'ENF T-42 INT',descricao:'SERVIÇO',valor:330,dataVencimento:'2026-11-07'});
 assert.equal(data.parceiroVinculado,true);assert.equal(data.turmaNome,'ENF T-42 INT');
 assert.equal(despesaToReciboData({...data,id:'demo',fornecedorId:undefined}).parceiroVinculado,false);
 for(const linked of [true,false]) {
  const d={...receipt,parceiroVinculado:linked,turmaNome:linked?'ENFERMAGEM INTEGRAL':undefined,turmaCodigo:linked?'ENF T-42 INT':undefined};
  const html=renderToStaticMarkup(React.createElement(Model,{data:d}));
  assert.equal(html.includes('ASSINATURA DO PARCEIRO'),linked);assert.equal(html.includes('Turma vinculada'),linked);
  let documentBlob;const original=URL.createObjectURL;
  URL.createObjectURL=blob=>{documentBlob=blob;return 'blob:fixture';};
  globalThis.window={open(){},setTimeout(){}};
  try {printReciboDespesa(d);} finally {URL.createObjectURL=original;delete globalThis.window;}
  const printed=await documentBlob.text();
  assert.equal(printed.includes('ASSINATURA DO PARCEIRO'),linked);assert.equal(printed.includes('Turma vinculada'),linked);
 }
 console.log('Recibo nativo: 4 PDFs de uma página, turma/código, assinatura condicional e nome longo, modelo/HTML, texto vetorial e marca institucional OK.');
} finally {await rm(temporary,{recursive:true,force:true});}

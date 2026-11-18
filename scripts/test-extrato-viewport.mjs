import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';

if (!process.env.PLAYWRIGHT_MODULE_PATH) throw new Error('Defina PLAYWRIGHT_MODULE_PATH para playwright-core/index.mjs.');
const { chromium } = await import(pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE_PATH)).href);
const root = resolve(import.meta.dirname, '..');
const temp = mkdtempSync(join(tmpdir(), 'extrato-viewport-'));
const entry = join(temp, 'entry.tsx');
writeFileSync(entry, `import React from '${root}/node_modules/react/index.js';
import {createRoot} from '${root}/node_modules/react-dom/client.js';
import {QueryClient,QueryClientProvider} from '${root}/node_modules/@tanstack/react-query/build/modern/index.js';
import Report from '${root}/modules/gestor/relatorios/components/RelatorioMovimentacaoFinanceira.tsx';
const global = !location.search.includes('local');
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Report company={{nomeFantasia:'Instituição de teste'}} polo={{id:'polo-a',nome:'Polo de teste'}} tipo="EXTRATO_CONTA" isGlobal={global}/></QueryClientProvider>);`);
await build({entryPoints:[entry],outfile:join(temp,'app.js'),bundle:true,platform:'browser',format:'esm',define:{'import.meta.env':JSON.stringify({VITE_SUPABASE_URL:'http://127.0.0.1:41791',VITE_SUPABASE_ANON_KEY:'test'})}});
writeFileSync(join(temp,'input.css'),'@tailwind base;\n@tailwind components;\n@tailwind utilities;');
execFileSync(resolve(root,'node_modules/.bin/tailwindcss'),['-i',join(temp,'input.css'),'-o',join(temp,'app.css'),'--content',resolve(root,'modules/gestor/relatorios/components/RelatorioMovimentacaoFinanceira.tsx')+','+resolve(root,'modules/gestor/relatorios/components/RelatorioShared.tsx')+','+resolve(root,'modules/gestor/relatorios/components/ExtratoContaScope.tsx')+','+resolve(root,'modules/gestor/relatorios/pdf/ReportPdfPreviewModal.tsx')],{cwd:root,stdio:'pipe'});
const html = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0;height:100vh;overflow:hidden"><header style="height:130px">SIMULAÇÃO DE TESTE</header><div style="height:calc(100vh - 130px);overflow:hidden;padding:24px"><div id="root" style="height:100%;overflow:hidden"></div></div><script type="module" src="/app.js"></script></body></html>';
const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url.startsWith('/app.js')?'application/javascript':req.url.startsWith('/app.css')?'text/css':'text/html');res.end(req.url.startsWith('/app.js')?readFileSync(join(temp,'app.js')):req.url.startsWith('/app.css')?readFileSync(join(temp,'app.css')):html);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
const url=`http://127.0.0.1:${server.address().port}`;
const requests=[];
try {
  for(const [width,height,local] of [[1366,768,false],[1093,614,false],[390,844,false],[1366,768,true]]) {
    const page=await browser.newPage({viewport:{width,height}});
    await page.route('**/rest/v1/rpc/**',route=>{
      if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
      const args=route.request().postDataJSON();requests.push(args);
      const selected=Boolean(args.p_conta_bancaria_id);
      const rows=selected?[1,2,3].map(i=>({id:String(i),data:`2026-11-0${i}`,direcao:i===2?'SAIDA':'ENTRADA',descricao:`Movimento ${i}`,polo:'Polo de teste',categoria:'Categoria',valor:10,valor_previsto:10,valor_realizado:10,saldo_apos:100+i*10})):[];
      return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({meta:{tipo:'EXTRATO_CONTA',data_inicio:'2026-11-01',data_fim:'2026-11-30',escopo:args.p_polo_id?'Polo de teste':'Consolidado',conta_selecionada:'Conta teste'},contas:[{id:'account-a',rotulo:'Conta compartilhada',compartilhada:true,ativa:true}],categorias:[],resumo:{total_lancamentos:rows.length,valor_previsto:30,valor_realizado:30,valor_em_aberto:0,total_entradas:20,total_saidas:10,saldo_abertura:args.p_polo_id?null:100,saldo_fechamento:args.p_polo_id?null:110,saldo_disponivel:!args.p_polo_id},movimentos:rows,completo:true,limite:1000})});
    });
    await page.goto(url+(local?'?local':''));
    await page.locator('select').filter({has:page.locator('option[value="account-a"]')}).selectOption('account-a');
    const scope=page.locator('select').filter({has:page.locator('option[value="CONTA"]')});
    if(local){assert.equal(await scope.count(),0);assert.equal(requests.at(-1).p_polo_id,'polo-a');await page.close();console.log('PASS gestor local mantém escopo e não vê opção global');continue;}
    await scope.waitFor();assert.equal(await scope.inputValue(),'CONTA');
    const button=page.getByRole('button',{name:'Gerar PDF',exact:true});
    await button.scrollIntoViewIfNeeded();
    const box=await button.boundingBox();assert.ok(box && box.y>=0 && box.y+box.height<=height,`${width}: PDF deve ficar dentro do viewport`);
    if(process.env.EXTRATO_VIEWPORT_OUTPUT) await page.screenshot({path:`${process.env.EXTRATO_VIEWPORT_OUTPUT}-filters-${width}.png`});
    await button.click();
    await page.locator('iframe').waitFor({timeout:15000});
    assert.ok(requests.some(r=>r.p_conta_bancaria_id==='account-a'&&r.p_polo_id===null));
    if(process.env.EXTRATO_VIEWPORT_OUTPUT) await page.screenshot({path:`${process.env.EXTRATO_VIEWPORT_OUTPUT}-${width}.png`});
    await page.close();console.log(`PASS viewport ${width}x${height}: botão acessível, clique e PDF real aberto, conta completa`);
  }
} finally {await browser.close();await new Promise(r=>server.close(r));rmSync(temp,{recursive:true,force:true});}

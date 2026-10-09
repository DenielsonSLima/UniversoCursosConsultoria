import assert from 'node:assert/strict';
import {before, after, test} from 'node:test';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {model, student, createFixtureImages, measureCards} from './student-card.browser.fixture.mjs';

const directory = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(directory, '../../../..');
const dependencies = process.env.STUDENT_CARD_NODE_MODULES || process.env.EAD_UI_NODE_MODULES;
const requireTool = createRequire(dependencies
  ? pathToFileURL(resolve(dependencies, '../student-card-runner.mjs')) : import.meta.url);
const {build} = requireTool('esbuild');
const {chromium} = requireTool('playwright');
const postcss = requireTool('postcss');
const tailwindcss = requireTool('tailwindcss');
const {createCanvas} = requireTool('@napi-rs/canvas');
const {getDocument, OPS} = await import(pathToFileURL(requireTool.resolve('pdfjs-dist/legacy/build/pdf.mjs')));
const standardFontDataUrl = resolve(requireTool.resolve('pdfjs-dist/package.json'), '../standard_fonts') + '/';
const output = resolve(process.env.STUDENT_CARD_ARTIFACTS || '/tmp/student-card-pdf');
const images = createFixtureImages(createCanvas);
const privateFixture = process.env.STUDENT_CARD_RENDER_FIXTURE
  ? JSON.parse(await readFile(process.env.STUDENT_CARD_RENDER_FIXTURE, 'utf8')) : {};
const fixture = {
  model: {...model, bgFrenteUrl: images.front, bgVersoUrl: images.back,
    assinaturaDiretorPngUrl: images.signature, ...privateFixture.model},
  student: {...student, fotoUrl: images.photo, ...privateFixture.student},
};
let browser, javascript, css;

before(async () => {
  await mkdir(output, {recursive: true});
  const compiled = await build({
    stdin: {contents: `import React from 'react';
      import {createRoot} from 'react-dom/client';
      import Preview from '../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
      import {buildStudentCardPdf, buildStudentCardSheetPdf} from '../../../shared/pdf/student-card/index';
      import StudentDocument from '../../../aluno/secretaria/components/StudentCardDocument';
      import Sheet from './SecretariaCarteirinhasPrintLayout';
      import {waitForCarteirinhaAssets} from '../../cadastros/modelos-documentos/carteirinha/carteirinha-assets';
      window.waitForCardAssets = options => waitForCarteirinhaAssets(document.getElementById('cards'), options);
      const blobIds = new WeakMap(); let nextBlobId = 1;
      const blobId = blob => {if(!blobIds.has(blob)) blobIds.set(blob,nextBlobId++);return blobIds.get(blob)};
      window.__pdfReads = []; window.__blobUrls = new Map();
      const originalRead = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function() {if(this.type==='application/pdf') window.__pdfReads.push(blobId(this));return originalRead.call(this)};
      const originalUrl = URL.createObjectURL.bind(URL);
      URL.createObjectURL = blob => {const url=originalUrl(blob);window.__blobUrls.set(url,{blob,id:blobId(blob)});return url};
      new MutationObserver(records => records.flatMap(record=>[...record.addedNodes]).forEach(node => {
        if(node.tagName!=='IFRAME' || node.getAttribute('aria-hidden')!=='true') return;
        // Observe the real print helper's input. A PDF plug-in owns its Window;
        // replacing Window.print is not a reliable test of an OS print dialog.
        window.__printFrame={blobId:window.__blobUrls.get(node.src)?.id,state:'attached'};
        node.addEventListener('load',()=>{
          window.__printFrame.state='loaded';
          try {window.__printFrame.printMethod=typeof node.contentWindow.print;}
          catch(error){window.__printFrame.accessError=error.name+': '+error.message;}
        });
      })).observe(document.body,{childList:true});
      window.renderCardUi = value => {
        window.__cardFixture = value;
        window.__cardRoot ||= createRoot(document.getElementById('root'));
        window.__cardRoot.render(value.ui==='student'
          ? <StudentDocument template={value.model} aluno={value.student} code={value.student.validationCode} expiresAt="2028-12-31"/>
          : <Sheet alunos={value.students} templateConfig={value.model} layoutType={value.layout || 'dobra'} startNumber={1000} onBack={()=>{}}/>);
      };
      window.renderCards = value => {
        window.__cardFixture = value;
        window.__cardRoot ||= createRoot(document.getElementById('root'));
        window.__cardRoot.render(<div id="cards" style={{padding:20,display:'flex',gap:30,alignItems:'start'}}>
          {(value.model.hasVerso === false ? ['frente'] : ['frente','verso']).map(side =>
            <div key={side} style={{width:85.6*value.zoom/100+'mm',height:54*value.zoom/100+'mm'}}>
              <Preview formData={value.model} page={side} zoomLevel={value.zoom} transformOrigin="top left" aluno={value.student}/>
            </div>)}
        </div>);
      };
      window.buildCardPdf = async mode => {
        const blob = await buildStudentCardPdf(document.getElementById('cards'), mode);
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      };
      window.buildCardSheetPdf = async () => {
        const blob = await buildStudentCardSheetPdf(document.getElementById('cards'));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));
      };`, loader: 'tsx', resolveDir: directory},
    bundle: true, format: 'iife', write: false, nodePaths: dependencies ? [dependencies] : [],
    define: {'import.meta.env': '{}'},
    plugins: [{name: 'signature-io', setup(plugin) {
      plugin.onResolve({filter:/assinaturas\.service$/}, () => ({path:'signature',namespace:'fixture'}));
      plugin.onLoad({filter:/.*/,namespace:'fixture'}, () => ({contents:`export const assinaturasService = {
        getSignaturesSync:()=>({}), getSignatures:async()=>{
          window.__signatureRequests=(window.__signatureRequests||0)+1;
          await new Promise(resolve=>setTimeout(resolve,120));
          return {diretoriaGeral:window.__cardFixture.model.assinaturaDiretorPngUrl};
        },
      };`}));
      plugin.onResolve({filter:/pdf\.worker\.min\.mjs\?url$/}, () => ({path:'pdf-worker',namespace:'worker'}));
      plugin.onLoad({filter:/.*/,namespace:'worker'}, async () => ({contents:
        'export default URL.createObjectURL(new Blob(['+JSON.stringify(await readFile(requireTool.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),'utf8'))+'],{type:"application/javascript"}));'}));
    }}],
  });
  javascript = compiled.outputFiles[0].text;
  const config = requireTool(resolve(root, 'tailwind.config.cjs'));
  const styles = (await readFile(resolve(root, 'styles.css'), 'utf8')).replace(/^@import.*$/gm, '');
  css = (await postcss([tailwindcss({...config, content: [
    resolve(root, 'modules/gestor/cadastros/modelos-documentos/carteirinha/**/*.tsx'),
    resolve(root, 'modules/gestor/secretaria/carteirinhas/**/*.tsx'),
    resolve(root, 'modules/shared/qrcode/**/*.tsx'),
    resolve(root, 'modules/shared/pdf/**/*.tsx'),
    resolve(root, 'modules/aluno/secretaria/**/*.tsx'),
  ]})]).process(styles, {from:resolve(root, 'styles.css')})).css;
  browser = await chromium.launch({headless:true,
    ...(process.env.STUDENT_CARD_BROWSER_EXECUTABLE
      ? {executablePath:process.env.STUDENT_CARD_BROWSER_EXECUTABLE} : {})});
});
after(async () => { await browser?.close(); });

async function open(value = {}) {
  const page = await browser.newPage({viewport:{width:1100,height:760}});
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>');
  await page.addStyleTag({content:css});
  await page.addScriptTag({content:javascript});
  if (!value.defer) {
    await page.evaluate(value => value.ui ? window.renderCardUi(value) : window.renderCards(value), {...fixture, zoom:100, ...value});
    await page.locator('.carteirinha-render-root').first().waitFor({state:'attached'});
  }
  return page;
}

async function savePdf(page, name, mode = 'digital') {
  const bytes = await page.evaluate(mode => window.buildCardPdf(mode), mode);
  return inspectPdf(bytes,name);
}
async function inspectPdf(bytes,name) {
  const path = resolve(output, name+'.pdf');
  await writeFile(path, Buffer.from(bytes));
  const document = await getDocument({data:Uint8Array.from(bytes), standardFontDataUrl, useSystemFonts:false}).promise;
  const evidence = [];
  try {
    for (let number=1; number<=document.numPages; number++) {
      const pdfPage = await document.getPage(number);
      const viewport = pdfPage.getViewport({scale:2});
      const canvas = createCanvas(viewport.width,viewport.height);
      await pdfPage.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
      await writeFile(resolve(output, name+'-'+number+'.png'),canvas.toBuffer('image/png'));
      const text = await pdfPage.getTextContent();
      const operators = await pdfPage.getOperatorList();
      evidence.push({size:pdfPage.view.slice(2),
        text:text.items.filter(item=>'str' in item).map(item=>({text:item.str, transform:item.transform,width:item.width,height:item.height})),
        images:operators.fnArray.filter(op=>op===OPS.paintImageXObject || op===OPS.paintInlineImageXObject).length,
        paths:operators.fnArray.filter(op=>op===OPS.constructPath).length,
      });
    }
  } finally { await document.destroy(); }
  await writeFile(resolve(output,name+'.json'),JSON.stringify(evidence,null,2));
  return evidence;
}
const normalized = value => value.replace(/\s+/g,' ').trim();
const textOf = pages => normalized(pages.flatMap(page=>page.text.map(item=>item.text)).join(' '));

test('digital card preserves original front/back assets, selectable identity and CR80 dimensions', async () => {
  const page = await open();
  try {
    const pdf = await savePdf(page,'digital');
    assert.equal(pdf.length, fixture.model.hasVerso===false ? 1 : 2);
    for (const side of pdf) {
      assert.ok(Math.abs(side.size[0]-85.6*72/25.4)<0.05);
      assert.ok(Math.abs(side.size[1]-54*72/25.4)<0.05);
      assert.ok(side.images>0, 'Configured background and isolated assets must be retained.');
    }
    const text = textOf(pdf);
    for (const value of [fixture.student.nome,fixture.student.curso,fixture.student.matricula,fixture.student.validationCode])
      assert.ok(text.includes(value), `Missing native text: ${value}`);
    assert.ok(text.includes(fixture.student.validade.split('/').slice(-2).join('/')), 'Validity must display the supplied canonical date, not the current year.');
    assert.ok(pdf[0].text.length>10, 'Text must remain native PDF content.');
    await page.locator('#cards').screenshot({path:resolve(output,'preview.png')});
    await writeFile(resolve(output,'dom-geometry.json'),JSON.stringify(await page.evaluate(measureCards),null,2));
  } finally { await page.close(); }
});

test('desktop/mobile/editor zoom cannot change PDF text, wrapping or physical positions', async () => {
  const all = [];
  for (const zoom of [100,90,82]) {
    const page = await open({zoom});
    try { all.push(await savePdf(page,'zoom-'+zoom)); } finally { await page.close(); }
  }
  for (const actual of all.slice(1)) {
    assert.equal(textOf(actual), textOf(all[0]));
    for (let side=0;side<actual.length;side++) {
      const expected = all[0][side].text.filter(item=>item.text.trim());
      const received = actual[side].text.filter(item=>item.text.trim());
      assert.equal(received.length,expected.length, 'Zoom must not reflow PDF lines.');
      received.forEach((item,index)=> {
        assert.equal(item.text,expected[index].text);
        for (const coordinate of [4,5]) assert.ok(
          Math.abs(item.transform[coordinate]-expected[index].transform[coordinate])<0.5,
          `Zoom changed native text position: ${item.text}`,
        );
        assert.ok(Math.abs(item.height-expected[index].height)<0.1, 'Zoom changed native font size.');
      });
    }
  }
});

test('A4 contains both real-size faces and crop marks, while a one-sided model stays one-sided', async () => {
  const page = await open();
  try {
    const pdf = await savePdf(page,'a4','a4');
    assert.equal(pdf.length,1);
    assert.ok(Math.abs(pdf[0].size[0]-210*72/25.4)<0.05);
    assert.ok(Math.abs(pdf[0].size[1]-297*72/25.4)<0.05);
    assert.ok(textOf(pdf).includes(fixture.student.validationCode));
    assert.ok(pdf[0].paths>0, 'Crop marks must be native paths.');
  } finally { await page.close(); }
  const frontOnly = await open({model:{...fixture.model,hasVerso:false}});
  try { assert.equal((await savePdf(frontOnly,'front-only')).length,1); }
  finally { await frontOnly.close(); }
});

test('standard model keeps vector design and CIN avoids duplicating the CPF identity slot', async () => {
  const page = await open({model:{...model,usePhotoshopLayout:false,bgFrenteUrl:'',bgVersoUrl:'',
    assinaturaDiretorPngUrl:images.signature},student:{...fixture.student,tipoDocumento:'CIN',rg:''}});
  try {
    const pdf = await savePdf(page,'standard-cin');
    const text = textOf(pdf);
    assert.match(text,/\bC\s*I\s*N\b/,'The CIN label must survive selectable text extraction, including configured letter spacing.');
    assert.ok(text.includes(fixture.student.cpf));
    assert.equal((text.match(/\bC\s*P\s*F\s*:/g)||[]).length,0);
    assert.ok(pdf[0].paths>3, 'Standard model panels, fields and borders must be vector paths.');
  } finally { await page.close(); }
});

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function download(page, button, name) {
  const event = page.waitForEvent('download');
  await button.click();
  const path = resolve(output,name+'.pdf');
  await (await event).saveAs(path);
  return new Uint8Array(await readFile(path));
}

test('real student PDF canvas, download and A4 dialog reuse their generated Blobs', async () => {
  const page = await open({ui:'student'});
  const warnings = [];
  page.on('console',event=>{if(['warning','error'].includes(event.type())) warnings.push(event.text());});
  try {
    const canvases = page.locator('[aria-label^="Prévia real de carteirinha"]');
    await canvases.first().waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('[aria-label^="Prévia real de carteirinha"]')]
      .every(node=>node.getAttribute('aria-busy')==='false'));
    assert.equal(await page.getByRole('alert').count(),0,'Actual PDF.js browser viewer must render successfully.');
    await page.screenshot({path:resolve(output,'student-real-canvas.png')});
    const downloaded = await download(page,page.getByRole('button',{name:'Baixar PDF',exact:true}),'student-ui');
    await inspectPdf(downloaded,'student-ui');
    const ids = await page.evaluate(()=>{
      const pdfUrls=[...window.__blobUrls.values()].filter(value=>value.blob.type==='application/pdf');
      return {download:pdfUrls.at(-1).id,reads:window.__pdfReads};
    });
    assert.ok(ids.reads.filter(id=>id===ids.download).length>=2,'Both preview pages must read the same Blob that is downloaded.');
    await page.getByRole('button',{name:'Imprimir',exact:true}).click();
    const frame=page.getByTitle('Prévia A4 da carteirinha');
    await frame.waitFor();
    const previewUrl=(await frame.getAttribute('src')).split('#')[0];
    const previewBytes=await page.evaluate(async url=>[...new Uint8Array(await window.__blobUrls.get(url).blob.arrayBuffer())],previewUrl);
    const a4=await download(page,page.getByRole('dialog').getByRole('button',{name:/Baixar/}),'student-ui-a4');
    assert.equal(digest(a4),digest(Buffer.from(previewBytes)));
    await writeFile(resolve(output,'student-browser-warnings.json'),JSON.stringify(warnings,null,2));
    assert.ok(!warnings.some(message=>/standardFontDataUrl|Cannot load font|Unable to load font|UnknownErrorException/i.test(message)),
      'Actual browser viewer must not silently lose standard fonts.');
  } finally { await page.close(); }
});

test('manager folding and duplex batches retain card order, native guides and the exact downloaded/printed Blob', async () => {
  for(const [layout,count,pages] of [['dobra',6,2],['espelhado',11,4]]) {
    const students=Array.from({length:count},(_,index)=>({...fixture.student,
      id:'synthetic-'+index,nome:'ALUNO SINTÉTICO '+String(index+1).padStart(2,'0'),
      poloRazaoSocial:'INSTITUIÇÃO SINTÉTICA '+String(index+1).padStart(2,'0'),
      validationCode:'CIE-TESTE-'+String(index+1).padStart(2,'0'),validationPublic:true}));
    const page=await open({ui:'manager',layout,students,model:{...fixture.model,assinaturaOrigem:'diretoriaGeral'}});
    try {
      const viewer=page.getByTitle('PDF oficial das carteirinhas');
      await viewer.waitFor({timeout:60000});
      const url=await viewer.getAttribute('src');
      const ready=await page.evaluate(async url=>{
        const value=window.__blobUrls.get(url.split('#')[0]);
        return {id:value.id,bytes:[...new Uint8Array(await value.blob.arrayBuffer())]};
      },url);
      const bytes=await download(page,page.getByRole('button',{name:'Baixar PDF',exact:true}),'manager-'+layout);
      assert.equal(digest(bytes),digest(Buffer.from(ready.bytes)));
      const pdf=await inspectPdf(bytes,'manager-'+layout);
      assert.equal(pdf.length,pages);
      assert.equal(await page.evaluate(()=>window.__signatureRequests),1,'Concurrent card backs must share the signature request.');
      for(const item of students) assert.ok(textOf(pdf).includes(item.nome));
      if(layout==='dobra') assert.ok(pdf[0].paths>5,'Fold guides must remain native PDF lines.');
      const frontCodes=pdf[0].text.map(item=>item.text).join(' ');
      assert.ok(frontCodes.indexOf(students[0].nome)<frontCodes.indexOf(students[1].nome));
      const sourceOrder=await page.locator('.print-page').evaluateAll(pages=>pages.map(page=>
        [...page.querySelectorAll('.carteirinha-render-root')].map(card=>card.textContent)));
      if(layout==='espelhado') {
        assert.ok(sourceOrder[1][0].includes(students[1].poloRazaoSocial));
        assert.ok(sourceOrder[1][1].includes(students[0].poloRazaoSocial));
        const backText=textOf([pdf[1]]);
        assert.ok(backText.indexOf(students[1].poloRazaoSocial)<backText.indexOf(students[0].poloRazaoSocial),
          'The physical back page must mirror each front pair for duplex alignment.');
        assert.equal(sourceOrder[0].length,10);
        assert.equal(sourceOrder[2].length,1);
      }
      await page.getByRole('button',{name:'Confirmar Impressão',exact:true}).click();
      await page.waitForFunction(()=>window.__printFrame?.blobId!==undefined);
      const printEvidence=await page.evaluate(()=>window.__printFrame);
      assert.equal(printEvidence.blobId,ready.id,'The real printing helper must receive the same Blob as preview/download.');
      await writeFile(resolve(output,'manager-'+layout+'-print-input.json'),JSON.stringify(printEvidence,null,2));
    } finally { await page.close(); }
  }
});

test('a missing background fails visibly, retry succeeds, and old student output is invalidated', async () => {
  const page=await open({defer:true});
  let broken=true;
  await page.route('https://card-fixture.invalid/background.png',route=>broken
    ? route.fulfill({status:404,body:'missing',headers:{'Access-Control-Allow-Origin':'*'}})
    : route.fulfill({status:200,contentType:'image/png',body:Buffer.from(images.front.split(',')[1],'base64'),headers:{'Access-Control-Allow-Origin':'*'}}));
  const value={...fixture,ui:'student',model:{...fixture.model,bgFrenteUrl:'https://card-fixture.invalid/background.png'}};
  try {
    await page.evaluate(value=>window.renderCardUi(value),value);
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button',{name:'Baixar PDF',exact:true}).isDisabled(),true);
    broken=false;
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
    await page.getByRole('button',{name:'Baixar PDF',exact:true}).waitFor();
    await page.waitForFunction(()=>!document.querySelector('button')?.disabled);
    const first=await download(page,page.getByRole('button',{name:'Baixar PDF',exact:true}),'retry');
    assert.ok(textOf(await inspectPdf(first,'retry')).includes(fixture.student.nome));
    const changed={...value,student:{...value.student,nome:'SEGUNDA ALUNA SINTÉTICA',validationCode:'CIE-NOVO-1234'}};
    await page.evaluate(value=>window.renderCardUi(value),changed);
    await page.waitForFunction(()=>!document.querySelector('button')?.disabled);
    const next=await download(page,page.getByRole('button',{name:'Baixar PDF',exact:true}),'changed-student');
    const text=textOf(await inspectPdf(next,'changed-student'));
    assert.ok(text.includes(changed.student.nome));
    assert.ok(!text.includes(fixture.student.nome),'Previous student data must not survive a render-key change.');
  } finally { await page.close(); }
});

test('asset wait rejects already-broken images and times out an unfinished asset', async () => {
  const page=await open();
  try {
    const broken=await page.evaluate(async()=>{
      const image=document.createElement('img'); image.src='data:image/png;base64,broken';
      document.getElementById('cards').appendChild(image);
      await new Promise(resolve=>setTimeout(resolve,30));
      try {await window.waitForCardAssets({timeoutMs:100});return null;}
      catch(error){return error.message;}
    });
    assert.match(broken,/carregar|inválida|decodificar/i);
    const timeout=await page.evaluate(async()=>{
      document.querySelector('#cards > img').remove();
      const pending=document.createElement('div');pending.dataset.renderReady='false';
      document.getElementById('cards').appendChild(pending);
      try{await window.waitForCardAssets({timeoutMs:100});return null;}
      catch(error){return error.message;}
    });
    assert.match(timeout,/Tempo esgotado/);
  } finally { await page.close(); }
});

test('a slow background keeps the official document in loading until the image is decoded', async () => {
  const page=await open({defer:true});
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  await page.route('https://card-fixture.invalid/slow.png',async route=>{
    await pending;
    await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(images.front.split(',')[1],'base64'),
      headers:{'Access-Control-Allow-Origin':'*'}});
  });
  try {
    await page.evaluate(value=>window.renderCardUi(value),{...fixture,ui:'student',
      model:{...fixture.model,bgFrenteUrl:'https://card-fixture.invalid/slow.png'}});
    await page.getByText('Preparando a carteirinha oficial…',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Baixar PDF',exact:true}).isDisabled(),true);
    assert.equal(await page.locator('[aria-label^="Prévia real de carteirinha"]').count(),0);
    release();
    await page.waitForFunction(()=>!document.querySelector('button')?.disabled);
    const bytes=await download(page,page.getByRole('button',{name:'Baixar PDF',exact:true}),'slow-background');
    assert.ok((await inspectPdf(bytes,'slow-background'))[0].images>=2);
  } finally { release(); await page.close(); }
});

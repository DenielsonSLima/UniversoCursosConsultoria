import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const directory = fileURLToPath(new URL('.', import.meta.url));
const requireTool = createRequire(process.env.EAD_UI_NODE_MODULES
  ? pathToFileURL(resolve(process.env.EAD_UI_NODE_MODULES, '../ead-identity-runner.mjs')) : import.meta.url);
const { build } = requireTool('esbuild');
const unrelated = name => `export const ${name}=new Proxy({}, {get(){return async()=>{throw Error('Unexpected unrelated IO')}}});`;
const io = {
  'carteirinha.service': unrelated('carteirinhaService'),
  'cracha.service': unrelated('crachaService'),
  'declaracao.service': unrelated('declaracaoService'),
  'declaracao-frequencia.service': unrelated('declaracaoFrequenciaService'),
  'irpf.service': unrelated('irpfService'),
  'boletim.service': unrelated('boletimService'),
  'historico.service': unrelated('historicoService'),
  'transferencia.service': unrelated('transferenciaService'),
  'document-layouts': `${unrelated('pastaIdentificacaoService')} export const fichaMatriculaDefaultTemplate=null;`,
  'fichas-matricula.service': unrelated('fichasMatriculaService'),
  'academicos.service': 'export const academicosService={getConfigs:async()=>({})};',
  'marca-dagua.service': 'export const marcaDaguaService={getCompaniesWithWatermark:async()=>[]};',
  'polos.service': 'export const polosService={getById:async()=>({})};',
  'academic-preview': "export const loadAcademicPreview=async()=>{throw Error('Unexpected academic RPC')};",
};
const compiled = await build({
  stdin: { contents: `
    export {getAlunoEadCertificate} from '../../../aluno/cursos/ead-certificate.service.ts';
    export {historicoEmissoesService} from '../historico-emissoes/historico-emissoes.service.ts';
    export {buildEadCertificateTemplateVars,replaceEadCertificateVars} from './components/certificado-preview.utils.ts';
    export {withCertificateEmissionIdentity} from './certificate-identity-snapshot.ts';
  `, resolveDir: directory }, bundle:true, format:'esm', platform:'node', write:false,
  nodePaths:process.env.EAD_UI_NODE_MODULES ? [process.env.EAD_UI_NODE_MODULES] : [],
  plugins:[{name:'projection-aware-database-io',setup(plugin){
    plugin.onResolve({filter:/lib\/supabase$/},()=>({path:'database',namespace:'io'}));
    plugin.onResolve({filter:/.*/},args=>{
      const name=args.path.split('/').at(-1);
      return name in io ? {path:name,namespace:'io'} : undefined;
    });
    plugin.onLoad({filter:/.*/,namespace:'io'},args=>({contents:args.path==='database'
      ? 'export const supabase={from:table=>globalThis.__identityDatabase(table)};' : io[args.path],loader:'js'}));
  }}],
});
const {
  getAlunoEadCertificate, historicoEmissoesService, buildEadCertificateTemplateVars,
  replaceEadCertificateVars, withCertificateEmissionIdentity,
} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

const identityFields = ['nome','cpf_cnpj','rg','tipo_documento','orgao_emissor','rg_uf_emissao','rg_data_emissao'];
const liveStudent = {
  nome:'ALUNO SINTÉTICO',cpf_cnpj:'12345678909',rg:'12.345.678-X',tipo_documento:'CIN',
  orgao_emissor:'SSP',rg_uf_emissao:'SE',rg_data_emissao:'2020-01-01',
};
const row = student => ({
  id:'CERT-SYNTHETIC',matricula_id:'ENROLLMENT-SYNTHETIC',aluno_id:'STUDENT-SYNTHETIC',
  curso_id:'COURSE-SYNTHETIC',modalidade:'EAD',status:'FINALIZADO',codigo_validacao:'CERT-TEST-IDENTITY',
  data_conclusao:'2026-10-08',metadados:{},aluno:student,curso:{nome:'Curso sintético'},
});
const emission = certificate => ({
  documento:'certificado_ead',codigo:certificate.codigo_validacao,matricula_id:certificate.matricula_id,
  dados_emissao:{certificateId:certificate.id,watermarkSnapshot:{},institutionSnapshot:{}},
});
const installDatabase = certificate => {
  const selects=[];
  globalThis.__identityDatabase = table => {
    const filters=[];
    let selected='';
    return {
      select(value){selected=value;return this;},eq(key,value){filters.push([key,value]);return this;},
      not(){return this;},order(){return this;},limit(){return this;},
      async maybeSingle(){
        if(table==='documentos_templates')return {data:{conteudo:[{id:'ead',tipoCurso:'Educação a Distância (EAD)'}]},error:null};
        assert.equal(table,'certificados_academicos');
        selects.push(selected);
        if(!filters.every(([key,value])=>certificate[key]===value))return {data:null,error:null};
        // Mimic PostgREST projection: omitted student fields remain absent instead of being supplied by the fixture.
        const fields=/aluno:parceiros![\w]+\(([^)]+)\)/.exec(selected)?.[1].split(',').map(field=>field.trim()) || [];
        const projected=Object.fromEntries(fields.map(field=>[field,certificate.aluno[field]]));
        return {data:{...certificate,aluno:projected},error:null};
      },
    };
  };
  return selects;
};

for (const documentType of ['CIN','CNI','RG (ANTIGO)','CARTEIRA NACIONAL DE IDENTIFICAÇÃO']) {
  test(`real student/history selects deliver identity fields before rendering ${documentType}`, async()=>{
    const certificate=row({...liveStudent,tipo_documento:documentType});
    const selects=installDatabase(certificate);
    const student=await getAlunoEadCertificate(certificate.aluno_id,certificate.curso_id);
    const history=await historicoEmissoesService.loadPreview(emission(certificate),'POLO-SYNTHETIC');
    assert.equal(selects.length,2);
    for(const actual of [student,history.certificate]){
      assert.deepEqual(Object.keys(actual.aluno).sort(),identityFields.toSorted());
      assert.deepEqual(actual.aluno,certificate.aluno);
      const values=buildEadCertificateTemplateVars(actual);
      assert.equal(values.cpf,'123.456.789-09');
      const text=replaceEadCertificateVars('CPF: {{cpf}}',actual,values,false);
      assert.equal(text,`${['CIN','CNI'].includes(documentType)?'CIN':'CPF'}: 123.456.789-09`);
    }
  });
}

test('actual historical identity adapter preserves explicit snapshot values, including null, against live CIN', async()=>{
  const certificate=row(liveStudent);
  installDatabase(certificate);
  const history=await historicoEmissoesService.loadPreview(emission(certificate),'POLO-SYNTHETIC');
  for(const [snapshot,expectedType,expectedCpf] of [
    [{studentDocumentType:'RG (ANTIGO)',studentCpf:'98765432100',studentRg:'9.876.543-X'},'CPF','987.654.321-00'],
    [{studentDocumentType:'CIN',studentCpf:null,studentRg:'RESIDUAL'},'CIN',''],
    [{studentDocumentType:'CIN',studentCpf:'',studentRg:'RESIDUAL'},'CIN',''],
    [{},'CIN','123.456.789-09'],
  ]){
    const restored=withCertificateEmissionIdentity(history.certificate,snapshot);
    const values=buildEadCertificateTemplateVars(restored);
    assert.equal(values.cpf,expectedCpf);
    const text=replaceEadCertificateVars('CPF: {{cpf}}',restored,values,false);
    assert.equal(text,`${expectedType}: ${expectedCpf}`);
    assert.ok(!text.includes('RESIDUAL'));
    assert.equal(restored.codigo_validacao,certificate.codigo_validacao);
    assert.equal(restored.data_conclusao,certificate.data_conclusao);
  }
});

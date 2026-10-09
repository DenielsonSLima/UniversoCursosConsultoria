export const student = {
  id: '00000000-0000-4000-8000-000000000ddf', tipo: 'Aluno', status: 'ATIVO',
  nome: 'ALUNA SINTÉTICA DE TESTE', cpf_cnpj: null, email: null,
  matricula_acesso: 'UNIV-A-00001000', created_at: '2026-01-01T00:00:00Z',
  polo_id: '11111111-1111-4111-8111-111111111111',
  foto_url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52"><rect width="52" height="52" fill="%23dbeafe"/></svg>',
};
export const enrollment = {
  id: '10000000-0000-4000-8000-000000001701', aluno_id: student.id,
  turma_id: '20000000-0000-4000-8000-000000000001', status: 'ATIVO', data_matricula: '2026-07-01',
  turmas: { id: '20000000-0000-4000-8000-000000000001', nome: 'TURMA DE TESTE',
    polo_id: '55555555-5555-5555-5555-555555555555', cursos: { id: 'course-test', nome: 'CURSO DE TESTE', modalidade: 'TECNICO' } },
};
export const createFixture = overrides => ({
  partners: [structuredClone(student)], enrollments: [structuredClone(enrollment)],
  config: { matriculaPrefix: 'UNIV-', matriculaDigits: 4, yearFormat: 'yy', usePoloCode: false },
  ...overrides,
});

// Only transport is simulated: getAll/getById, mapper, primary selection and all
// three visible product components are imported from their actual source files.
export const supabaseStub = `
const pause = ms => new Promise(resolve=>setTimeout(resolve,ms));
export const supabase={from(table){
  const filter=[]; let single=false;
  const query={
    select(columns){
      window.reads.push({table,columns});
      // PostgREST rejects unknown top-level columns; nested relation columns are separate.
      let depth=0,field='',fields=[];
      for(const char of (columns||'*')+','){
        if(char==='(')depth++;if(char===')')depth--;
        if(char===','&&depth===0){fields.push(field.trim());field=''}else field+=char;
      }
      if(table==='matriculas')for(const column of fields){
        if(column!=='*'&&!column.includes('(')&&!['id','aluno_id','turma_id','status','data_matricula'].includes(column))
          throw Error('Column does not exist: matriculas.'+column);
      }
      return query;
    },
    eq(key,value){filter.push(row=>row[key]===value);return query},
    in(key,values){filter.push(row=>values.includes(row[key]));return query},
    or(){return query},order(){return query},
    single(){single=true;return query},maybeSingle(){single=true;return query},
    then(resolve,reject){return (async()=>{
      if(table==='documentos_templates'){
        await pause(window.fixture.configDelay||0);
        return window.fixture.configError ? {data:null,error:{message:'Configuração indisponível'}} : {data:{conteudo:window.fixture.config},error:null};
      }
      if(table==='matriculas'&&window.fixture.enrollmentError) return {data:null,error:{message:'Consulta de matrícula indisponível'}};
      const source=table==='parceiros'?window.fixture.partners:table==='matriculas'?window.fixture.enrollments:null;
      if(!source) throw Error('Unexpected table '+table);
      const rows=source.filter(row=>filter.every(match=>match(row)));
      return {data:structuredClone(single?rows[0]||null:rows),error:null};
    })().then(resolve,reject)}
  };return query;
}};`;

export const portalStub = `export const portalActivationService={
  getPartnerEmailStatuses:async()=>[],
  getPartnerGoogleIdentityStatus:async()=>({email:null,has_auth_user:true,google_linked:false}),
};`;

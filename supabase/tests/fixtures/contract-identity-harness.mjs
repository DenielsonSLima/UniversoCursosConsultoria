import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const contractFixtureRead = path => readFile(new URL(path, import.meta.url), 'utf8');
export const contractMigrations = [
  '../../migrations/20261009163050_contract_student_identity_render.sql',
  '../../migrations/20261009163100_contract_student_identity_snapshot.sql',
  '../../migrations/20261009163109_contract_student_identity_history.sql',
];
export async function createContractPGlite() {
  const moduleName = process.env.PGLITE_MODULE_PATH
    ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite';
  const { PGlite } = await import(moduleName);
  return new PGlite();
}
export async function createContractIdentityDatabase() {
  const db = await createContractPGlite();
  try {
    await db.exec(await contractFixtureRead('./contract-identity-schema.sql'));
    await db.exec(await contractFixtureRead('./contract-identity-pagination.sql'));
    await db.exec(await contractFixtureRead('./contract-identity-boundaries.sql'));
    const migrations = await Promise.all(contractMigrations.map(contractFixtureRead));
    for (const sql of migrations) {
      for (const header of sql.match(/CREATE OR REPLACE FUNCTION public\.[\s\S]*?(?=AS \$function\$)/g) || []) {
        await db.exec(`${header}AS $baseline$ begin raise exception 'Baseline stub'; end; $baseline$;`);
      }
    }
    await db.exec(`revoke all on function public.preparar_emissao_contrato_aluno_base_secure(uuid,text,uuid[],text,uuid),
      public.renderizar_contrato_aluno_documento(jsonb,jsonb,text,timestamptz),
      public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer),
      public.preparar_emissao_contrato_aluno_secure(uuid,text,uuid[],text,uuid)
      from public,anon,authenticated,service_role;
      grant execute on function public.search_secretaria_emissions_secure(uuid,text,uuid,text,integer,integer),
      public.preparar_emissao_contrato_aluno_secure(uuid,text,uuid[],text,uuid) to authenticated,service_role;`);
    for (const sql of migrations) await db.exec(sql);
    await db.query(`insert into public.documentos_modelos_configuracoes values
      ('contrato_aluno','TECNICO',7,'ATIVO',$1)`, [contractFixtureTemplate]);
    await db.exec(`select set_config('test.allowed_polo','10000000-0000-0000-0000-000000000001',false);
      select set_config('test.allowed_tab','true',false);
      select set_config('request.jwt.claim.role','authenticated',false);`);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
export const contractFixtureTemplate = {
  presentationVersion: 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA',
  tituloDocumento: 'CONTRATO PERSONALIZADO DE TESTE',
  cabecalho: 'MODELO CONFIGURADO • SECRETARIA ACADÊMICA',
  corpo: 'Aluno: {{aluno.nome}}, CPF: {{aluno.cpf}}, RG/Documento: {{aluno.rg}}, Órgão Expedidor: {{aluno.orgaoExpedidor}}, UF de emissão: {{aluno.rgUfEmissao}}, Data de emissão: {{aluno.rgDataEmissao}}.\n\nResponsável: {{aluno.responsavel.nome}}, CPF: {{aluno.responsavel.cpf}}.\n\nCLÁUSULA PERSONALIZADA: a matrícula do curso {{curso.nome}} seguirá as condições previamente configuradas. Parcela: {{financeiro.valorParcela}}.\n\nValidação: {{validacao.codigo}}.',
  rodape: '________________________________________________\nALUNO OU RESPONSÁVEL\n________________________________________________\nINSTITUIÇÃO DE ENSINO',
  qr: { habilitado: true, rotulo: 'Validar documento', modoValidade: 'SEM_VENCIMENTO' },
  marcaDagua: { habilitada: true, intensidade: 'LEVE' },
};
export const contractFixtureSnapshot = {
  aluno: {
    id: '40000000-0000-0000-0000-000000000001', nome: 'ALUNO SINTETICO DOCUMENTAL',
    cpf: '12345678909', nascimento: '2000-01-01', nascimentoExibicao: '01/01/2000',
    endereco: { logradouro: 'Rua de Teste', numero: '1', bairro: 'Centro', cidade: 'Cidade', uf: 'SE', cep: '49000000' },
    telefone: '(79) 90000-0000', email: 'student@example.invalid',
    responsavel: { nome: 'RESPONSAVEL SINTETICO', cpf: '987.654.321-00', telefone: '(79) 90000-0001' },
  },
  instituicao: {
    poloId: '10000000-0000-0000-0000-000000000001', nome: 'INSTITUIÇÃO SINTÉTICA',
    nomeFantasia: 'INSTITUIÇÃO SINTÉTICA', razaoSocial: 'INSTITUIÇÃO SINTÉTICA LTDA', cnpj: '12.345.678/0001-95',
    endereco: 'Rua de Teste', numero: '1', complemento: 'Sala 1', bairro: 'Centro', cidade: 'Cidade',
    uf: 'SE', estado: 'SE', cep: '49000-000', telefone: '(79) 90000-0000', email: 'school@example.invalid',
    isMatriz: true, presentationVersion: 'CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA',
  },
  curso: { nome: 'Curso Técnico Sintético', modalidade: 'TECNICO', cargaHoraria: 1200 },
  turma: { nome: 'Turma de teste', codigo: 'TESTE', inicioExibicao: '01/01/2026' },
  marcaDagua: { texto: 'INSTITUIÇÃO SINTÉTICA', opacidade: 0.06, escala: 50, rotacionar: true },
  financeiro: { valorParcela: 279.90, valorParcelaExibicao: 'R$ 279,90', quantidadeParcelas: 12,
    titulos: [{ descricao: 'Parcela congelada', valor: 279.90, status: 'PENDENTE' }] },
  emissao: { dataExibicao: '09/10/2026' },
};

export async function createContractIdentityFixtures({ template = contractFixtureTemplate } = {}) {
  const db = await createContractPGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create schema internal_academic;');
    await db.exec(await contractFixtureRead('./contract-identity-pagination.sql'));
    await db.exec(await contractFixtureRead(contractMigrations[0]));
    const cases = [
      { name: 'CIN', student: { tipoDocumento: 'CIN', rg: '12345678909', orgaoExpedidor: 'SSP', rgUfEmissao: 'SE' },
        identity: ['CIN: 123.456.789-09'], absent: ['CPF: 123.456.789-09', 'RG: 12345678909', 'Órgão Expedidor: SSP'] },
      { name: 'RG_CPF', student: { tipoDocumento: 'RG (ANTIGO)', rg: '1.234.567-X', orgaoExpedidor: 'SSP', rgUfEmissao: 'SE', rgDataEmissao: '2020-01-24' },
        identity: ['CPF: 123.456.789-09', 'RG: 1.234.567-X', 'Órgão Expedidor: SSP', 'UF de emissão: SE', 'Data de emissão: 24/01/2020'], absent: ['CIN: 123.456.789-09'] },
      { name: 'CPF', student: { tipoDocumento: null, rg: null, orgaoExpedidor: null, rgUfEmissao: null },
        identity: ['CPF: 123.456.789-09'], absent: ['RG/Documento:', 'Órgão Expedidor:', 'UF de emissão:', 'Data de emissão:'] },
    ];
    const fixtures = [];
    for (const scenario of cases) {
      const snapshot = { ...contractFixtureSnapshot, aluno: { ...contractFixtureSnapshot.aluno, ...scenario.student } };
      const code = `TEST-CONTRACT-${scenario.name}`;
      const rendered = (await db.query('select public.renderizar_contrato_aluno_documento($1, $2, $3, null) as rendered',
        [template, snapshot, code])).rows[0].rendered;
      fixtures.push({ name: scenario.name, identity: scenario.identity, absent: scenario.absent,
        snapshot, template, rendered });
    }
    return fixtures;
  } finally { await db.close(); }
}

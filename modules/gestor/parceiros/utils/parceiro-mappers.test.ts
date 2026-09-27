import test from 'node:test';
import assert from 'node:assert/strict';
import { toCamel, toSnake } from './parceiro-mappers.ts';

test('mapeia categoria e tipo de parceria sem perder os textos legados', () => {
  const parceiro = toCamel({
    id: 'partner-1',
    tipo: 'PJ',
    nome: 'Empresa Teste',
    tipo_pj: 'CLASSIFICAÇÃO ANTIGA',
    tipo_convenio: 'FORNECEDOR',
    categoria_id: 'category-1',
    tipo_parceria_id: 'partnership-type-1',
    categoria: { id: 'category-1', nome: 'Supermercado', status: 'ativo' },
    tipo_parceria: { id: 'partnership-type-1', nome: 'FORNECEDOR', status: 'ativo' },
  });

  assert.equal(parceiro.categoriaId, 'category-1');
  assert.equal(parceiro.categoriaNome, 'Supermercado');
  assert.equal(parceiro.tipoParceriaId, 'partnership-type-1');
  assert.equal(parceiro.tipoParceriaNome, 'FORNECEDOR');
  assert.equal(parceiro.classificacaoLegada, 'CLASSIFICAÇÃO ANTIGA');
});

test('mantém o tipo de convênio antigo como fallback para cadastros ainda não vinculados', () => {
  const parceiro = toCamel({
    id: 'partner-legacy',
    tipo: 'PJ',
    nome: 'Empresa Legada',
    tipo_pj: 'FACULDADE PARCEIRA / AFILIADO',
    tipo_convenio: 'FACULDADE PARCEIRA / AFILIADO',
  });

  assert.equal(parceiro.categoriaNome, null);
  assert.equal(parceiro.tipoParceriaNome, 'FACULDADE PARCEIRA / AFILIADO');
  assert.equal(parceiro.tipoConvenio, 'FACULDADE PARCEIRA / AFILIADO');
});

test('grava os novos vínculos e os textos compatíveis no payload do parceiro', () => {
  const payload = toSnake({
    tipo: 'PJ',
    nome: 'Empresa Nova',
    categoriaId: 'category-1',
    tipoParceriaId: 'partnership-type-1',
    tipoPj: 'Supermercado',
    tipoConvenio: 'FORNECEDOR',
  });

  assert.equal(payload.categoria_id, 'category-1');
  assert.equal(payload.tipo_parceria_id, 'partnership-type-1');
  assert.equal(payload.tipo_pj, 'Supermercado');
  assert.equal(payload.tipo_convenio, 'FORNECEDOR');
});

test('mapeia o ciclo de acesso sem apagá-lo em uma atualização sem esses campos', () => {
  const parceiro = toCamel({
    id: 'student-1',
    tipo: 'Aluno',
    nome: 'Aluno Teste',
    acesso_status: 'erro',
    acesso_erro: 'Falha operacional segura',
    convite_enviado_em: '2026-08-03T10:00:00.000Z',
    acesso_ativado_em: null,
  });
  const unrelatedUpdate = toSnake({ tipo: 'Aluno', nome: 'Aluno Teste' });

  assert.equal(parceiro.acessoStatus, 'erro');
  assert.equal(parceiro.acessoErro, 'Falha operacional segura');
  assert.equal(parceiro.conviteEnviadoEm, '2026-08-03T10:00:00.000Z');
  assert.equal('acesso_status' in unrelatedUpdate, false);
  assert.equal('acesso_erro' in unrelatedUpdate, false);
  assert.equal('troca_senha_obrigatoria' in unrelatedUpdate, false);
});

test('expõe a identidade Auth do professor sem reenviá-la em atualizações', () => {
  const professor = toCamel({
    id: 'professor-auth-1',
    tipo: 'Professor',
    nome: 'Professor de Teste',
    auth_user_id: 'auth-professor-1',
    auth_login_email: 'professor@example.com',
  });
  const update = toSnake({
    ...professor,
    nome: 'Professor Atualizado',
  });

  assert.equal(professor.authUserId, 'auth-professor-1');
  assert.equal(professor.authLoginEmail, 'professor@example.com');
  assert.equal('auth_user_id' in update, false);
});

test('preserva dados eleitorais entre o contrato snake_case e o formulário camelCase', () => {
  const aluno = toCamel({
    id: 'student-voter-fields',
    tipo: 'Aluno',
    nome: 'Aluno de Teste',
    titulo_eleitor: '123456789012',
    titulo_eleitor_zona: '010',
    titulo_eleitor_secao: '020',
    titulo_eleitor_data_emissao: '2026-08-08',
    titulo_eleitor_uf: 'se',
  });

  assert.equal(aluno.tituloEleitor, '123456789012');
  assert.equal(aluno.tituloEleitorZona, '010');
  assert.equal(aluno.tituloEleitorSecao, '020');
  assert.equal(aluno.tituloEleitorDataEmissao, '08/08/2026');
  assert.equal(aluno.tituloEleitorUf, 'SE');

  const payload = toSnake({
    tipo: 'Aluno',
    nomeCompleto: 'Aluno de Teste',
    tituloEleitor: aluno.tituloEleitor,
    tituloEleitorZona: aluno.tituloEleitorZona,
    tituloEleitorSecao: aluno.tituloEleitorSecao,
    tituloEleitorDataEmissao: aluno.tituloEleitorDataEmissao,
    tituloEleitorUf: aluno.tituloEleitorUf,
  });

  assert.equal(payload.titulo_eleitor, '123456789012');
  assert.equal(payload.titulo_eleitor_zona, '010');
  assert.equal(payload.titulo_eleitor_secao, '020');
  assert.equal(payload.titulo_eleitor_data_emissao, '2026-08-08');
  assert.equal(payload.titulo_eleitor_uf, 'SE');
});

test('mantém a documentação técnica pendente no cadastro inicial de aluno', () => {
  const payload = toSnake({
    tipo: 'Aluno',
    nomeCompleto: 'Aluno de Teste',
    matricularAgora: false,
    tipoDocumento: '',
    certidaoTipo: '',
    certidaoModelo: '',
    certidaoMatricula: '',
    certidaoTermo: '',
    certidaoLivro: '',
    certidaoFolha: '',
  });

  assert.equal(payload.tipo_documento, null);
  assert.equal(payload.certidao_tipo, null);
  assert.equal(payload.certidao_modelo, null);
  assert.equal(payload.certidao_matricula, null);
  assert.equal(payload.certidao_termo, null);
  assert.equal(payload.certidao_livro, null);
  assert.equal(payload.certidao_folha, null);
});

test('não presume CIN quando o tipo de documento está vazio', () => {
  const aluno = toCamel({
    id: 'student-no-document',
    tipo: 'Aluno',
    nome: 'Aluno sem Documento',
    tipo_documento: null,
  });
  const payload = toSnake({
    tipo: 'Aluno',
    nomeCompleto: 'Aluno sem Documento',
    tipoDocumento: '',
  });

  assert.equal(aluno.tipoDocumento, '');
  assert.equal(payload.tipo_documento, null);
});

test('padroniza CIN explícita e preserva o default ambíguo, RG e CNH', () => {
  assert.equal(toCamel({ tipo: 'Aluno', tipo_documento: 'CNI' }).tipoDocumento, 'CARTEIRA DE IDENTIDADE NACIONAL');
  assert.equal(toSnake({ tipo: 'Aluno', tipoDocumento: 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO' }).tipo_documento, 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
  assert.equal(toSnake({ tipo: 'Aluno', tipoDocumento: 'RG' }).tipo_documento, 'RG (ANTIGO)');
  assert.equal(toSnake({ tipo: 'Aluno', tipoDocumento: 'CNH' }).tipo_documento, 'CNH');
});

test('preserva texto e referências padronizadas de nacionalidade e naturalidade', () => {
  const payload = toSnake({
    tipo: 'Aluno',
    nomeCompleto: 'Aluno de Teste',
    nacionalidade: 'BRASILEIRA',
    nacionalidadeCodigoIso3: 'BRA',
    naturalidade: 'NEÓPOLIS/SE',
    naturalidadeCodigoIbge: '2804409',
    naturalidadeUf: 'SE',
  });
  const aluno = toCamel({
    tipo: 'Aluno',
    nome: 'Aluno de Teste',
    nacionalidade: payload.nacionalidade,
    nacionalidade_codigo_iso3: payload.nacionalidade_codigo_iso3,
    naturalidade: payload.naturalidade,
    naturalidade_codigo_ibge: payload.naturalidade_codigo_ibge,
    naturalidade_uf: payload.naturalidade_uf,
  });

  assert.equal(payload.nacionalidade_codigo_iso3, 'BRA');
  assert.equal(payload.naturalidade_codigo_ibge, 2804409);
  assert.equal(payload.naturalidade_uf, 'SE');
  assert.equal(aluno.nacionalidadeCodigoIso3, 'BRA');
  assert.equal(aluno.naturalidadeCodigoIbge, '2804409');
  assert.equal(aluno.naturalidadeUf, 'SE');

  const defaultNationality = toSnake({ tipo: 'Aluno', nomeCompleto: 'Novo Aluno' });
  assert.equal(defaultNationality.nacionalidade, 'BRASILEIRA');
  assert.equal(defaultNationality.nacionalidade_codigo_iso3, 'BRA');
});

test('grava aluno e parceiro PF no polo ativo recebido pelo formulário', () => {
  const poloAtivo = '11111111-1111-4111-8111-111111111111';

  const aluno = toSnake({
    tipo: 'Aluno',
    nomeCompleto: 'Aluno de Teste',
    poloId: poloAtivo,
  });
  const parceiroPf = toSnake({
    tipo: 'PF',
    nomeCompleto: 'Prestador de Teste',
    poloId: poloAtivo,
  });

  assert.equal(aluno.polo_id, poloAtivo);
  assert.deepEqual(aluno.polo_ids, [poloAtivo]);
  assert.equal(parceiroPf.polo_id, poloAtivo);
  assert.deepEqual(parceiroPf.polo_ids, [poloAtivo]);
});

test('mantém a parceria PJ global sem polo individual', () => {
  const parceria = toSnake({
    tipo: 'PJ',
    nomeCompleto: 'Parceria Global',
    poloId: '',
    poloIds: [],
  });

  assert.equal(parceria.polo_id, null);
  assert.deepEqual(parceria.polo_ids, []);
});

test('grava a parceria PJ em um único polo escolhido', () => {
  const poloEscolhido = '22222222-2222-4222-8222-222222222222';
  const parceria = toSnake({
    tipo: 'PJ',
    nomeCompleto: 'Parceria por Polo',
    poloId: poloEscolhido,
    poloIds: [poloEscolhido],
  });

  assert.equal(parceria.polo_id, poloEscolhido);
  assert.deepEqual(parceria.polo_ids, [poloEscolhido]);
});

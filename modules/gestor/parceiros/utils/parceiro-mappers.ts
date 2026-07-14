import { dateBrToDb, dateDbToBr } from './date-utils';
import { ESTANCIA_LEGACY_POLO_ID, MATRIZ_POLO_ID, UUID_RE } from './parceiros.constants';
import { uppercaseAlunoTextFields } from './aluno-formatters';

const uniqueTruthy = <T,>(values: Array<T | null | undefined>) =>
  Array.from(new Set(values.filter(Boolean) as T[]));

const resolvePoloId = (data: any): string | null => {
  const directPoloId = data?.poloId || data?.polo_id;
  if (directPoloId && UUID_RE.test(String(directPoloId))) return String(directPoloId).toLowerCase();
  if (data?.polo === 'matriz') return MATRIZ_POLO_ID;
  if (data?.polo === 'estancia') return ESTANCIA_LEGACY_POLO_ID;
  return null;
};

export const formatPoloNome = (polo: any, fallbackPoloId?: string | null) => {
  if (polo?.nome) {
    const cidadeUf = [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/');
    return cidadeUf ? `${polo.nome} - ${cidadeUf}` : polo.nome;
  }
  if (fallbackPoloId === MATRIZ_POLO_ID) return 'Matriz';
  if (fallbackPoloId === ESTANCIA_LEGACY_POLO_ID) return 'Polo Estância';
  return 'Geral (Todos os Polos)';
};

export const mapAlunoLookup = (row: any) => ({
  id: row.id,
  nome: row.nome,
  cpf: row.cpf_masked || null,
  email: null,
  status: row.status,
  poloId: row.polo_id,
  poloIds: row.polo_ids || [],
  tipo: 'Aluno',
  existingAluno: true,
  jaVinculadoPolo: Boolean(row.ja_vinculado_polo),
});

export function toCamel(s: any) {
  if (!s) return null;

  const poloNome = formatPoloNome(s.polos, s.polo_id);

  const result = {
    id: s.id,
    tipo: s.tipo,
    nome: s.nome,
    nomeCompleto: s.nome,
    cpf: s.cpf_cnpj,
    cnpj: s.cpf_cnpj,
    email: s.email,
    telefone: s.telefone,
    contato1: s.telefone,
    cep: s.cep,
    endereco: s.endereco,
    numero: s.numero,
    complemento: s.complemento,
    bairro: s.bairro,
    cidade: s.cidade,
    uf: s.uf,
    poloId: s.polo_id,
    polo: s.polo_id === MATRIZ_POLO_ID
      ? 'matriz'
      : (s.polo_id === ESTANCIA_LEGACY_POLO_ID ? 'estancia' : 'geral'),
    poloNome,
    status: s.status,
    observacao: s.observacao,
    foto: s.foto_url,
    dataNascimento: dateDbToBr(s.data_nascimento),
    sexo: s.sexo,
    rg: s.rg,
    tipoDocumento: s.tipo_documento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    orgaoEmissor: s.orgao_emissor,
    rgUfEmissao: s.rg_uf_emissao,
    rgDataEmissao: dateDbToBr(s.rg_data_emissao),
    nacionalidade: s.nacionalidade,
    naturalidade: s.naturalidade,
    tituloEleitor: s.titulo_eleitor,
    reservista: s.reservista,
    nomeMae: s.nome_mae,
    nomePai: s.nome_pai,
    nomeSocial: s.nome_social,
    estadoCivil: s.estado_civil,
    pcd: s.pcd,
    pcdTipo: s.pcd_tipo,
    escolaridadeAnterior: s.escolaridade_anterior,
    instituicaoOrigem: s.instituicao_origem,
    anoConclusaoEnsinoMedio: s.ano_conclusao_ensino_medio,
    responsavelNome: s.responsavel_nome,
    responsavelCpf: s.responsavel_cpf,
    responsavelParentesco: s.responsavel_parentesco,
    responsavelTelefone: s.responsavel_telefone,
    responsavelEmail: s.responsavel_email,
    responsavelFinanceiro: s.responsavel_financeiro,
    responsavelCargo: s.responsavel_cargo,
    especialidade: s.especialidade,
    titulacao: s.titulacao,
    areaFormacao: s.area_formacao,
    registroProfissional: s.registro_profissional,
    numeroRegistro: s.numero_registro,
    instituicaoFormacao: s.instituicao_formacao,
    tipoVinculo: s.tipo_vinculo,
    chavePix: s.chave_pix,
    banco: s.banco,
    agencia: s.agencia,
    conta: s.conta,
    tipoConta: s.tipo_conta,
    tipoServico: s.tipo_servico,
    tipoPj: s.tipo_pj,
    tipoConvenio: s.tipo_convenio,
    aceitouTermosUso: s.aceitou_termos_uso,
    aceitouTermosUsoEm: s.aceitou_termos_uso_em,
    termosUsoVersao: s.termos_uso_versao,
    trocaSenhaObrigatoria: s.troca_senha_obrigatoria,
    poloIds: s.polo_ids || [],
    modalidadesAluno: s.modalidadesAluno || [],
    cursosAlunoIds: s.cursosAlunoIds || [],
    turmasAlunoIds: s.turmasAlunoIds || [],
    createdAt: s.created_at,
    updatedAt: s.updated_at
  };

  return s.tipo === 'Aluno' ? uppercaseAlunoTextFields(result) : result;
}

export function toSnake(c: any) {
  if (!c) return null;

  const source = c.tipo === 'Aluno' ? uppercaseAlunoTextFields(c) : c;

  const poloId = resolvePoloId(source);
  const poloIds = uniqueTruthy<string>([
    ...((Array.isArray(source.poloIds) ? source.poloIds : source.polo_ids) || []),
    poloId,
  ]);

  return {
    tipo: source.tipo,
    nome: source.nomeCompleto || source.nome,
    cpf_cnpj: source.cpf || source.cnpj || source.cpf_cnpj || null,
    email: source.email || null,
    telefone: source.contato1 || source.telefone || null,
    cep: source.cep || null,
    endereco: source.endereco || null,
    numero: source.numero || null,
    complemento: source.complemento || null,
    bairro: source.bairro || null,
    cidade: source.cidade || null,
    uf: source.uf || null,
    polo_id: poloId,
    status: source.status || 'ATIVO',
    observacao: source.observacao || null,
    foto_url: source.foto || null,
    data_nascimento: dateBrToDb(source.dataNascimento),
    sexo: source.sexo || null,
    rg: source.rg || null,
    tipo_documento: source.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    orgao_emissor: source.orgaoEmissor || null,
    rg_uf_emissao: source.rgUfEmissao || null,
    rg_data_emissao: dateBrToDb(source.rgDataEmissao),
    nacionalidade: source.nacionalidade || 'BRASILEIRA',
    naturalidade: source.naturalidade || null,
    titulo_eleitor: source.tituloEleitor || null,
    reservista: source.reservista || null,
    nome_mae: source.nomeMae || null,
    nome_pai: source.nomePai || null,
    nome_social: source.nomeSocial || null,
    estado_civil: source.estadoCivil || null,
    pcd: source.pcd || false,
    pcd_tipo: source.pcdTipo || null,
    escolaridade_anterior: source.escolaridadeAnterior || null,
    instituicao_origem: source.instituicaoOrigem || null,
    ano_conclusao_ensino_medio: source.anoConclusaoEnsinoMedio || null,
    responsavel_nome: source.responsavelNome || null,
    responsavel_cpf: source.responsavelCpf || null,
    responsavel_parentesco: source.responsavelParentesco || null,
    responsavel_telefone: source.responsavelTelefone || null,
    responsavel_email: source.responsavelEmail || null,
    responsavel_financeiro: source.responsavelFinanceiro || false,
    responsavel_cargo: source.responsavelCargo || null,
    especialidade: source.especialidade || null,
    titulacao: source.titulacao || null,
    area_formacao: source.areaFormacao || null,
    registro_profissional: source.registroProfissional || null,
    numero_registro: source.numeroRegistro || null,
    instituicao_formacao: source.instituicaoFormacao || null,
    tipo_vinculo: source.tipoVinculo || null,
    chave_pix: source.chavePix || null,
    banco: source.banco || null,
    agencia: source.agencia || null,
    conta: source.conta || null,
    tipo_conta: source.tipoConta || null,
    tipo_servico: source.tipoServico || null,
    tipo_pj: source.tipoPj || null,
    tipo_convenio: source.tipoConvenio || null,
    aceitou_termos_uso: source.aceitouTermosUso ?? source.aceitou_termos_uso ?? false,
    aceitou_termos_uso_em: source.aceitouTermosUsoEm || source.aceitou_termos_uso_em || null,
    termos_uso_versao: source.termosUsoVersao || source.termos_uso_versao || null,
    troca_senha_obrigatoria: source.trocaSenhaObrigatoria ?? source.troca_senha_obrigatoria ?? false,
    polo_ids: poloIds,
  };
}

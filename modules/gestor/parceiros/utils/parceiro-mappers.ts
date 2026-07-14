import { dateBrToDb, dateDbToBr } from './date-utils';
import { ESTANCIA_LEGACY_POLO_ID, MATRIZ_POLO_ID, UUID_RE } from './parceiros.constants';

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

  return {
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
}

export function toSnake(c: any) {
  if (!c) return null;

  const poloId = resolvePoloId(c);
  const poloIds = uniqueTruthy<string>([
    ...((Array.isArray(c.poloIds) ? c.poloIds : c.polo_ids) || []),
    poloId,
  ]);

  return {
    tipo: c.tipo,
    nome: c.nomeCompleto || c.nome,
    cpf_cnpj: c.cpf || c.cnpj || c.cpf_cnpj || null,
    email: c.email || null,
    telefone: c.contato1 || c.telefone || null,
    cep: c.cep || null,
    endereco: c.endereco || null,
    numero: c.numero || null,
    complemento: c.complemento || null,
    bairro: c.bairro || null,
    cidade: c.cidade || null,
    uf: c.uf || null,
    polo_id: poloId,
    status: c.status || 'ATIVO',
    observacao: c.observacao || null,
    foto_url: c.foto || null,
    data_nascimento: dateBrToDb(c.dataNascimento),
    sexo: c.sexo || null,
    rg: c.rg || null,
    tipo_documento: c.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO',
    orgao_emissor: c.orgaoEmissor || null,
    rg_uf_emissao: c.rgUfEmissao || null,
    rg_data_emissao: dateBrToDb(c.rgDataEmissao),
    nacionalidade: c.nacionalidade || 'Brasileira',
    naturalidade: c.naturalidade || null,
    titulo_eleitor: c.tituloEleitor || null,
    reservista: c.reservista || null,
    nome_mae: c.nomeMae || null,
    nome_pai: c.nomePai || null,
    nome_social: c.nomeSocial || null,
    estado_civil: c.estadoCivil || null,
    pcd: c.pcd || false,
    pcd_tipo: c.pcdTipo || null,
    escolaridade_anterior: c.escolaridadeAnterior || null,
    instituicao_origem: c.instituicaoOrigem || null,
    ano_conclusao_ensino_medio: c.anoConclusaoEnsinoMedio || null,
    responsavel_nome: c.responsavelNome || null,
    responsavel_cpf: c.responsavelCpf || null,
    responsavel_parentesco: c.responsavelParentesco || null,
    responsavel_telefone: c.responsavelTelefone || null,
    responsavel_email: c.responsavelEmail || null,
    responsavel_financeiro: c.responsavelFinanceiro || false,
    responsavel_cargo: c.responsavelCargo || null,
    especialidade: c.especialidade || null,
    titulacao: c.titulacao || null,
    area_formacao: c.areaFormacao || null,
    registro_profissional: c.registroProfissional || null,
    numero_registro: c.numeroRegistro || null,
    instituicao_formacao: c.instituicaoFormacao || null,
    tipo_vinculo: c.tipoVinculo || null,
    chave_pix: c.chavePix || null,
    banco: c.banco || null,
    agencia: c.agencia || null,
    conta: c.conta || null,
    tipo_conta: c.tipoConta || null,
    tipo_servico: c.tipoServico || null,
    tipo_pj: c.tipoPj || null,
    tipo_convenio: c.tipoConvenio || null,
    aceitou_termos_uso: c.aceitouTermosUso ?? c.aceitou_termos_uso ?? false,
    aceitou_termos_uso_em: c.aceitouTermosUsoEm || c.aceitou_termos_uso_em || null,
    termos_uso_versao: c.termosUsoVersao || c.termos_uso_versao || null,
    troca_senha_obrigatoria: c.trocaSenhaObrigatoria ?? c.troca_senha_obrigatoria ?? false,
    polo_ids: poloIds,
  };
}

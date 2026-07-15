import { supabase } from '../../../lib/supabase';
import { uppercaseAlunoTextFields } from '../../gestor/parceiros/utils/aluno-formatters';
import { dateBrToDb } from '../../gestor/parceiros/utils/date-utils';
import { toCamel } from '../../gestor/parceiros/utils/parceiro-mappers';
import { PerfilUpdatePayload } from './perfil.types';

const emptyToNull = (value: string) => value || null;
const integerToNull = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
};

const toEditableAlunoPatch = (payload: PerfilUpdatePayload) => {
  const source = uppercaseAlunoTextFields(payload);
  const isStudyingHighSchool = source.situacaoEnsinoMedio === 'CURSANDO';

  return {
    telefone: emptyToNull(source.telefone),
    cep: emptyToNull(source.cep),
    endereco: emptyToNull(source.endereco),
    numero: emptyToNull(source.numero),
    complemento: emptyToNull(source.complemento),
    bairro: emptyToNull(source.bairro),
    cidade: emptyToNull(source.cidade),
    uf: emptyToNull(source.uf),
    data_nascimento: dateBrToDb(source.dataNascimento),
    sexo: emptyToNull(source.sexo),
    estado_civil: emptyToNull(source.estadoCivil),
    nacionalidade: emptyToNull(source.nacionalidade),
    naturalidade: emptyToNull(source.naturalidade),
    tipo_documento: emptyToNull(source.tipoDocumento),
    rg: emptyToNull(source.rg),
    orgao_emissor: emptyToNull(source.orgaoEmissor),
    rg_uf_emissao: emptyToNull(source.rgUfEmissao),
    rg_data_emissao: dateBrToDb(source.rgDataEmissao),
    nome_mae: emptyToNull(source.nomeMae),
    nome_pai: emptyToNull(source.nomePai),
    escolaridade_anterior: emptyToNull(source.escolaridadeAnterior),
    instituicao_origem: emptyToNull(source.instituicaoOrigem),
    ano_conclusao_ensino_medio: isStudyingHighSchool
      ? null
      : emptyToNull(source.anoConclusaoEnsinoMedio),
    situacao_ensino_medio: emptyToNull(source.situacaoEnsinoMedio),
    serie_ensino_medio_atual: isStudyingHighSchool
      ? integerToNull(source.serieEnsinoMedioAtual)
      : null,
    escola_ensino_medio: emptyToNull(source.escolaEnsinoMedio),
    ano_previsto_conclusao_ensino_medio: isStudyingHighSchool
      ? integerToNull(source.anoPrevistoConclusaoEnsinoMedio)
      : null,
    responsavel_nome: emptyToNull(source.responsavelNome),
    responsavel_cpf: emptyToNull(source.responsavelCpf),
    responsavel_parentesco: emptyToNull(source.responsavelParentesco),
    responsavel_telefone: emptyToNull(source.responsavelTelefone),
    responsavel_email: emptyToNull(source.responsavelEmail),
    responsavel_financeiro: source.responsavelFinanceiro,
  };
};

export const updateAlunoEditableProfile = async (
  alunoId: string,
  payload: PerfilUpdatePayload,
) => {
  const { data, error } = await supabase
    .from('parceiros')
    .update(toEditableAlunoPatch(payload))
    .eq('id', alunoId)
    .eq('tipo', 'Aluno')
    .select()
    .single();

  if (error) throw error;
  return toCamel(data);
};

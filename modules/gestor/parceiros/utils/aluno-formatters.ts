const ALUNO_UPPERCASE_FIELDS = [
  'nome',
  'nomeCompleto',
  'nomeSocial',
  'status',
  'endereco',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'observacao',
  'sexo',
  'rg',
  'tipoDocumento',
  'orgaoEmissor',
  'rgUfEmissao',
  'nacionalidade',
  'naturalidade',
  'tituloEleitor',
  'reservista',
  'nomeMae',
  'nomePai',
  'estadoCivil',
  'pcdTipo',
  'escolaridadeAnterior',
  'instituicaoOrigem',
  'anoConclusaoEnsinoMedio',
  'responsavelNome',
  'responsavelParentesco',
] as const;

/**
 * Padroniza os campos textuais do cadastro do aluno sem alterar e-mails,
 * telefones, documentos numéricos, URLs ou outros identificadores.
 */
export const uppercaseAlunoTextFields = <T extends Record<string, any>>(data: T): T => {
  const normalized = { ...data };

  ALUNO_UPPERCASE_FIELDS.forEach((field) => {
    const value = normalized[field];
    if (typeof value === 'string') normalized[field] = value.toUpperCase();
  });

  return normalized;
};

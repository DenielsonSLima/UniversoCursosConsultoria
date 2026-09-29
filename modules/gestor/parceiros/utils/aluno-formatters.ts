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
  'racaCor',
  'rg',
  'tipoDocumento',
  'rgUfEmissao',
  'certidaoTipo',
  'certidaoModelo',
  'certidaoLivro',
  'nacionalidade',
  'naturalidade',
  'tituloEleitor',
  'tituloEleitorUf',
  'reservista',
  'nomeMae',
  'nomePai',
  'estadoCivil',
  'pcdTipo',
  'escolaridadeAnterior',
  'instituicaoOrigem',
  'anoConclusaoEnsinoMedio',
  'situacaoEnsinoMedio',
  'escolaEnsinoMedio',
  'responsavelNome',
  'responsavelParentesco',
] as const;

/**
 * Padroniza os campos textuais do cadastro do aluno sem alterar e-mails,
 * telefones, documentos numéricos, URLs ou outros identificadores. Órgão emissor
 * é uma chave do catálogo; seu legado deve permanecer literal até nova seleção.
 */
export const uppercaseAlunoTextFields = <T extends Record<string, any>>(data: T): T => {
  const normalized: Record<string, any> = { ...data };

  ALUNO_UPPERCASE_FIELDS.forEach((field) => {
    const value = normalized[field];
    if (typeof value === 'string') normalized[field] = value.toUpperCase();
  });

  return normalized as T;
};

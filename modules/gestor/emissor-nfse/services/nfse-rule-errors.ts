/** Exact backend validations only. Never reflect SQL, XML, credentials or personal data. */
const rules: Record<string, string> = {
  'Salve os parâmetros fiscais antes do certificado.': 'Em Configurações do emissor, salve os parâmetros fiscais da unidade antes de cadastrar o certificado.',
  'Certificado fora da validade.': 'O certificado está vencido ou ainda não entrou em validade. Confira as datas em Configurações > Certificado e selecione um certificado vigente.',
  'Certificado válido da matriz indisponível.': 'Não há certificado válido da matriz disponível para esta operação. Confira a validade e o vínculo da unidade em Configurações > Certificado.',
  'Material do certificado indisponível.': 'O serviço não conseguiu obter o certificado para assinatura. Peça à administração para verificar o cadastro em Configurações > Certificado; isso não confirma senha incorreta.',
  'Revise a configuração e o certificado de produção.': 'A configuração fiscal ou o certificado de produção não está pronto para esta operação. Confira ambos em Configurações do emissor, na unidade selecionada. O retorno não identifica qual dos dois falhou.',
  'CNPJ do certificado indisponível.': 'O CNPJ necessário ao vínculo do certificado está ausente ou incompatível. Confira os CNPJs da unidade e da origem do certificado em Configurações.',
  'Referência de certificado exige CNPJs da mesma raiz.': 'O certificado compartilhado exige CNPJs da mesma raiz. Confira o CNPJ da unidade e a origem selecionada em Configurações > Certificado.',
  'Informe a apuração tributária do Simples Nacional.': 'Informe a apuração tributária do Simples Nacional nos parâmetros fiscais da unidade em Configurações.',
  'O certificado mudou. Confira a preparação.': 'O certificado mudou desde a preparação. Confira o certificado em Configurações e atualize a prévia da mesma operação antes de continuar.',
  'A referência do certificado mudou. Revise a configuração.': 'A origem do certificado mudou. Atualize a configuração da unidade antes de continuar.',
  'O modelo selecionado mudou. Atualize a preparação.': 'O pré-modelo foi alterado. Atualize a preparação com a versão atual em Modelos antes de continuar.',
  'O modelo da preparação mudou. Confira novamente a origem.': 'O pré-modelo da preparação mudou. Confira a origem em Modelos e atualize a preparação antes de continuar.',
  'O modelo mudou. Atualize os modelos.': 'Outra alteração modificou este modelo. Atualize a lista em Modelos e confira a versão antes de salvar.',
  'Selecione o modelo de origem confirmado.': 'Selecione um modelo de origem confirmado na preparação de produção.',
  'Seleção, modelo e mês dos recebimentos são obrigatórios.': 'Para preparar as notas, selecione os recebimentos, o pré-modelo e o mês correspondente.',
  'Tomador ativo com documento válido obrigatório.': 'O tomador precisa estar ativo e ter CPF/CNPJ válido. Confira o cadastro do aluno ou parceiro antes de preparar a nota.',
  'Descrição preenchida excede 1.000 caracteres.': 'A descrição final do serviço ultrapassa 1.000 caracteres. Reduza o texto no modelo ou lançamento do serviço.',
  'Confirme a regra de competência no pré-modelo do serviço.': 'Defina a regra de competência em Modelos para o serviço selecionado antes de preparar a nota.',
  'Retenção ISS incompatível com tributação, suspensão ou regime.': 'A retenção de ISS está incompatível com a tributação, suspensão ou regime informados. Confira esses campos tributários no pré-modelo; não altere o regime sem orientação contábil.',
  'Alíquota ISS fixa exige operação tributável e regime diferente de MEI.': 'O pré-modelo usa alíquota fixa de ISS, mas a operação precisa ser tributável e o regime diferente de MEI. Confira a tributação e a alíquota do modelo.',
  'O endereço mudou. Atualize a prévia antes de preparar a DPS.': 'O endereço cadastrado mudou. Feche e reabra a mesma operação para atualizar os dados e confira a nova prévia antes de preparar a DPS.',
  'A revisão ou os recebimentos mudaram. Revise antes de emitir.': 'Os recebimentos ou a preparação foram alterados. Atualize a mesma operação e confira os valores antes de emitir.',
};
export function nfseRuleError(message: unknown): string | null {
  return typeof message === 'string' && Object.hasOwn(rules, message) ? rules[message] : null;
}

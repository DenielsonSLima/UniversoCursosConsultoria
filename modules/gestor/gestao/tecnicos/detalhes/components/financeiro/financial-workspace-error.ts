interface FinancialWorkspaceErrorPresentation {
  title: string;
  message: string;
}

export const getFinancialWorkspaceErrorPresentation = (
  error: unknown,
): FinancialWorkspaceErrorPresentation => {
  const databaseError = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown }
    : null;

  if (
    databaseError?.code === '22023'
    && databaseError.message === 'Regra financeira técnica inválida.'
  ) {
    return {
      title: 'Regras financeiras pendentes',
      message: 'A turma ainda não possui uma configuração financeira válida de matrícula, '
        + 'mensalidades, vencimento e encargos. Essa pendência impede o carregamento desta tela; '
        + 'ela não significa ausência de cobranças ou recebimentos. '
        + 'Após a configuração da turma ser confirmada, tente novamente.',
    };
  }

  return {
    title: 'Resumo financeiro não carregado',
    message: 'Os totais foram ocultados para não apresentar receita, recebimentos ou '
      + 'inadimplência como zero por engano.',
  };
};

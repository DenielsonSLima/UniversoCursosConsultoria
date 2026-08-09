/**
 * Compatibilidade de importação do módulo financeiro antigo.
 *
 * A fonte canônica da configuração técnica agora é o workspace/RPC flexível.
 * Novos consumidores devem importar diretamente de
 * `useMatriculaTecnicaFinanceiro`.
 */
export {
  useMatriculaTecnicaFinanceiroWorkspace as useFinanceiroConfig,
  usePreverRegraFinanceiraTecnica as useFinanceiroRulesCalculation,
  useSalvarRegraFinanceiraTecnica as useSaveFinanceiroConfigMutation,
} from './useMatriculaTecnicaFinanceiro';

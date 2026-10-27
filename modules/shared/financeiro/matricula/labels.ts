import type { FinancialOrigin } from './contract';
export const financialOriginLabels: Record<FinancialOrigin, string> = {
  PROESC_HISTORY: 'Histórico Proesc', BANESE_LEGACY_IMPORTED: 'Banese importado',
  UNIVERSO_NATIVE: 'Emissão própria Universo', LOCAL: 'Registro local',
  UNKNOWN: 'Origem a conferir', CONFLICT: 'Vínculos em revisão',
};
export const cycleDecisionReasons: Record<string, string> = {
  OPERACAO_EXISTENTE: 'Operação existente — consultar ou retomar, sem criar novamente',
  COBRANCAS_EXISTENTES: 'Cobranças existentes sem operação de emissão — conferir composição, sem duplicar',
  CICLO_EXTERNO_EXISTENTE: 'Ciclo com histórico externo registrado',
  HISTORICO_EM_REVISAO: 'Vínculo histórico em revisão técnica',
  IDENTIDADE_HISTORICA_EM_REVISAO: 'Identidade histórica divergente — revisar vínculo',
  CONTINUIDADE_NA_MATRICULA_ORIGEM: 'Ciclo mantido na matrícula de origem da transferência',
  CICLO_FORA_DO_PLANO_INDIVIDUAL: 'Ciclo não incluído no plano individual recebido',
  SEM_COBRANCAS_PLANEJADAS: 'Sem cobranças no plano individual deste ciclo',
  STATUS_ACADEMICO: 'Situação acadêmica não permite nova emissão',
  SEM_CONFIGURACAO: 'Configure as condições financeiras desta matrícula',
  NAO_HABILITADO: 'Fluxo manual não configurado',
  CORRECAO_EM_ANDAMENTO: 'Preserve a operação de correção existente',
};

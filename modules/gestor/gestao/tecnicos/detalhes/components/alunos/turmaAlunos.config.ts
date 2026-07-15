export interface EnrollmentFlagConfig {
  financeiro_herdado: boolean;
  gerar_cobranca_inicial: boolean;
  gerar_cobranca_futura: boolean | null;
  sincronizar_asaas: boolean | null;
}

export const ENROLLMENT_PHASES = new Set([
  'PLANEJADA',
  'INSCRICOES_ABERTAS',
  'EM_ANDAMENTO',
]);

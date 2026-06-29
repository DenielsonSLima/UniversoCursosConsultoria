import { asaasIntegrationService } from '../../../../asaas/asaas.service';
import { academicLifecycleService } from './academic-lifecycle.service';

export interface MatricularAlunoComCobrancaInput {
  turmaId: string;
  alunoId: string;
  responsavelId?: string | null;
  financeiro_herdado?: boolean;
  gerar_cobranca_inicial?: boolean;
  gerar_cobranca_futura?: boolean | null;
  sincronizar_asaas?: boolean | null;
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  dataVencimentoMatricula: string;
  diaVencimento: number;
}

export interface MatricularAlunoComCobrancaResult {
  matricula: any;
  asaasSynced: boolean;
  asaasSkipped?: boolean;
  asaasSkipReason?: string | null;
  asaasError?: string;
}

export const turmaAsaasService = {
  async matricularAlunoComCobranca(
    input: MatricularAlunoComCobrancaInput,
  ): Promise<MatricularAlunoComCobrancaResult> {
    const matricula = await academicLifecycleService.matricularAlunoComFinanceiro({
      turmaId: input.turmaId,
      alunoId: input.alunoId,
      responsavelId: input.responsavelId,
      financeiro_herdado: input.financeiro_herdado,
      gerar_cobranca_inicial: input.gerar_cobranca_inicial,
      gerar_cobranca_futura: input.gerar_cobranca_futura,
      sincronizar_asaas: input.sincronizar_asaas,
      valorMatricula: input.valorMatricula,
      valorParcela: input.valorParcela,
      valorRematricula: input.valorRematricula,
      dataVencimentoMatricula: input.dataVencimentoMatricula,
      diaVencimento: input.diaVencimento,
    });

    try {
      const syncResult = await asaasIntegrationService.syncEnrollment(matricula.id);
      return {
        matricula,
        asaasSynced: Boolean(syncResult.receivable?.asaas_payment_id) && syncResult.skipped !== true,
        asaasSkipped: syncResult.skipped === true,
        asaasSkipReason: syncResult.skippedReason || null,
      };
    } catch (error) {
      console.error('Matrícula criada, mas a cobrança Asaas não foi sincronizada:', error);
      return {
        matricula,
        asaasSynced: false,
        asaasError: error instanceof Error ? error.message : 'Falha na integração Asaas',
      };
    }
  },
};

import {
  asaasIntegrationService,
  type GatewayPaymentMethod,
} from '../../../../../asaas/asaas.service';
import { requireGatewayPaymentMethod } from '../../../../../asaas/enrollment-sync';
import { academicLifecycleService } from '../academic-lifecycle.service';

export interface MatricularAlunoComCobrancaInput {
  turmaId: string;
  alunoId: string;
  financeiro_herdado?: boolean;
  gerar_cobranca_inicial?: boolean;
  gerar_cobranca_futura?: boolean | null;
  sincronizar_asaas?: boolean | null;
  paymentMethod?: GatewayPaymentMethod | null;
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  descontoPontualidade?: number;
  jurosAtraso?: number;
  multaAtraso?: number;
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
    const gerarCobrancaInicial = input.gerar_cobranca_inicial
      ?? (input.financeiro_herdado !== true);
    const paymentMethod = gerarCobrancaInicial
      ? requireGatewayPaymentMethod(input.paymentMethod)
      : null;
    if (
      gerarCobrancaInicial && input.sincronizar_asaas !== false && paymentMethod
    ) {
      // O preflight ocorre antes do RPC que cria matricula/recebivel para que
      // uma opcao sem rota/credencial nao deixe dados parciais.
      await asaasIntegrationService.preflightEnrollmentCharge(
        input.turmaId,
        paymentMethod,
      );
    }
    const matricula = await academicLifecycleService.matricularAlunoComFinanceiro({
      turmaId: input.turmaId,
      alunoId: input.alunoId,
      financeiro_herdado: input.financeiro_herdado,
      gerar_cobranca_inicial: input.gerar_cobranca_inicial,
      gerar_cobranca_futura: input.gerar_cobranca_futura,
      sincronizar_asaas: input.sincronizar_asaas,
      valorMatricula: input.valorMatricula,
      valorParcela: input.valorParcela,
      valorRematricula: input.valorRematricula,
      descontoPontualidade: input.descontoPontualidade,
      jurosAtraso: input.jurosAtraso,
      multaAtraso: input.multaAtraso,
      dataVencimentoMatricula: input.dataVencimentoMatricula,
      diaVencimento: input.diaVencimento,
    });

    try {
      const syncResult = await asaasIntegrationService.syncEnrollment(
        matricula.id,
        paymentMethod,
      );
      const gatewayReference = syncResult.receivable?.gateway_payment_id
        || syncResult.receivable?.gateway_payment_link_id
        || syncResult.receivable?.gateway_invoice_url
        || syncResult.receivable?.asaas_payment_id
        || syncResult.receivable?.asaas_payment_link_id
        || syncResult.receivable?.asaas_invoice_url;
      return {
        matricula,
        asaasSynced: Boolean(gatewayReference) && syncResult.skipped !== true,
        asaasSkipped: syncResult.skipped === true,
        asaasSkipReason: syncResult.skippedReason || null,
      };
    } catch (error) {
      console.error('Matrícula criada, mas a cobrança não foi sincronizada no gateway:', error);
      return {
        matricula,
        asaasSynced: false,
        asaasError: error instanceof Error ? error.message : 'Falha na integração com o gateway',
      };
    }
  },
};

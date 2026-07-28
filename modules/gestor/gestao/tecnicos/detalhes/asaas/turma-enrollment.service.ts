import {
  requireGatewayPaymentMethod,
  type GatewayPaymentMethod,
} from '../../../../../asaas/enrollment-sync';

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

export interface TurmaEnrollmentDependencies {
  preflightEnrollmentCharge: (
    turmaId: string,
    paymentMethod: GatewayPaymentMethod,
  ) => Promise<unknown>;
  syncEnrollment: (
    matriculaId: string,
    paymentMethod: GatewayPaymentMethod,
  ) => Promise<any>;
  matricularAlunoComFinanceiro: (
    input: Omit<MatricularAlunoComCobrancaInput, 'paymentMethod'>,
  ) => Promise<any>;
}

export const createTurmaEnrollmentService = (
  dependencies: TurmaEnrollmentDependencies,
) => ({
  async matricularAlunoComCobranca(
    input: MatricularAlunoComCobrancaInput,
  ): Promise<MatricularAlunoComCobrancaResult> {
    const gerarCobrancaInicial = input.gerar_cobranca_inicial
      ?? (input.financeiro_herdado !== true);
    const deveSincronizarGateway = gerarCobrancaInicial
      && input.sincronizar_asaas !== false;
    const paymentMethod = deveSincronizarGateway
      ? requireGatewayPaymentMethod(input.paymentMethod)
      : null;

    if (deveSincronizarGateway && paymentMethod) {
      await dependencies.preflightEnrollmentCharge(
        input.turmaId,
        paymentMethod,
      );
    }

    const { paymentMethod: _paymentMethod, ...matriculaInput } = input;
    const matricula = await dependencies.matricularAlunoComFinanceiro(matriculaInput);

    if (!deveSincronizarGateway) {
      return {
        matricula,
        asaasSynced: false,
        asaasSkipped: true,
        asaasSkipReason: gerarCobrancaInicial
          ? 'A matrícula e a cobrança inicial foram geradas localmente; a sincronização com o gateway está desativada.'
          : 'A regra financeira desta matrícula não exige cobrança inicial.',
      };
    }

    try {
      const syncResult = await dependencies.syncEnrollment(
        matricula.id,
        paymentMethod!,
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
});

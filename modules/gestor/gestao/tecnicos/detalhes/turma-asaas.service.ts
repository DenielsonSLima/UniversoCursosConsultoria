import { asaasIntegrationService } from '../../../../asaas/asaas.service';
import { academicLifecycleService } from './academic-lifecycle.service';

export interface MatricularAlunoComCobrancaInput {
  turmaId: string;
  alunoId: string;
  responsavelId?: string | null;
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  dataVencimentoMatricula: string;
  diaVencimento: number;
}

export interface MatricularAlunoComCobrancaResult {
  matricula: any;
  asaasSynced: boolean;
  asaasError?: string;
}

export const turmaAsaasService = {
  async matricularAlunoComCobranca(
    input: MatricularAlunoComCobrancaInput,
  ): Promise<MatricularAlunoComCobrancaResult> {
    await asaasIntegrationService.testConnection();

    const matricula = await academicLifecycleService.matricularAlunoComFinanceiro({
      turmaId: input.turmaId,
      alunoId: input.alunoId,
      responsavelId: input.responsavelId,
      valorMatricula: input.valorMatricula,
      valorParcela: input.valorParcela,
      valorRematricula: input.valorRematricula,
      dataVencimentoMatricula: input.dataVencimentoMatricula,
      diaVencimento: input.diaVencimento,
    });

    try {
      await asaasIntegrationService.syncEnrollment(matricula.id);
      return { matricula, asaasSynced: true };
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

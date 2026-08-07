import {
  asaasIntegrationService,
} from '../../../../../asaas/asaas.service';
import { academicLifecycleService } from '../academic-lifecycle.service';
import {
  createTurmaEnrollmentService,
  type TurmaEnrollmentDependencies,
} from './turma-enrollment.service';

const defaultDependencies: TurmaEnrollmentDependencies = {
  preflightEnrollmentCharge: (...args) =>
    asaasIntegrationService.preflightEnrollmentCharge(...args),
  syncEnrollment: (...args) => asaasIntegrationService.syncEnrollment(...args),
  matricularAlunoComFinanceiro: (...args) =>
    academicLifecycleService.matricularAlunoComFinanceiro(...args),
};

export type {
  MatricularAlunoComCobrancaInput,
  MatricularAlunoComCobrancaResult,
} from './turma-enrollment.service';

export const turmaAsaasService = createTurmaEnrollmentService(defaultDependencies);

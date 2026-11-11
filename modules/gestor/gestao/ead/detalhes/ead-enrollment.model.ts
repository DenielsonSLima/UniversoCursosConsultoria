import { canAccessGestorModule, canAccessGestaoTurmaTab, type GestorPermissions } from '../../../access-control';
import type { PublicCheckoutResult } from '../../../../asaas/checkout-result';

export type EadEnrollmentMode = 'GERAR_COBRANCA' | 'SEM_COBRANCA';
export type EadEnrollmentInput = { alunoId: string; mode: EadEnrollmentMode; requestId: string };
export type EadEnrollmentResult =
  | { mode: 'GERAR_COBRANCA'; checkout: PublicCheckoutResult }
  | { mode: 'SEM_COBRANCA'; matriculaId: string; status: 'ATIVO'; replayed: boolean };

// Academic staff may enroll with a mandatory charge. Only Financeiro may waive it.
// The server additionally authorizes profile, write permission and the class polo.
export const canAddAlunoEad = (permissions: GestorPermissions) =>
  canAccessGestaoTurmaTab(permissions, 'alunos');

export const canChooseEadFinancial = (permissions: GestorPermissions) =>
  canAddAlunoEad(permissions) && canAccessGestorModule(permissions, 'financeiro');

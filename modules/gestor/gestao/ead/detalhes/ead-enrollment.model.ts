import { canAccessGestorModule, canAccessGestaoTurmaTab, type GestorPermissions } from '../../../access-control';
import type { PublicCheckoutResult } from '../../../../asaas/checkout-result';

export type EadEnrollmentMode = 'GERAR_COBRANCA' | 'SEM_COBRANCA';
export type EadEnrollmentInput = { alunoId: string; mode: EadEnrollmentMode; requestId: string };
export type EadEnrollmentResult =
  | { mode: 'GERAR_COBRANCA'; checkout: PublicCheckoutResult }
  | { mode: 'SEM_COBRANCA'; matriculaId: string; status: 'ATIVO'; replayed: boolean };

// Financeiro is an effective module permission. Caixa alone is insufficient.
// The server additionally authorizes profile, write permission and the class polo.
export const canAddAlunoEad = (permissions: GestorPermissions) =>
  canAccessGestorModule(permissions, 'financeiro') && canAccessGestaoTurmaTab(permissions, 'alunos');

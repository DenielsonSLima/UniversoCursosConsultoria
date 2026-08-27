import {
  canAccessFinanceiroTab,
  canAccessGestorModule,
  type GestorPermissions,
} from '../../access-control.ts';
import { resolveDashboardStudentFinanceAccess } from './dashboard-student-finance.model';

export const getDashboardStudentFinanceAccess = (
  permissions: GestorPermissions,
) => {
  const canUseFinance = canAccessGestorModule(permissions, 'financeiro');
  const canReadSummary = canAccessFinanceiroTab(permissions, 'resumo');
  const canReceive = canAccessFinanceiroTab(permissions, 'receber');

  return resolveDashboardStudentFinanceAccess(canUseFinance, canReadSummary, canReceive);
};

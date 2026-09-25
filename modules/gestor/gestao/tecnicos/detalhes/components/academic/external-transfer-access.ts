import {
  canAccessFinanceiroTab, canAccessGestaoTurmaTab, canAccessGestorModule,
  type GestorPermissions,
} from '../../../../../access-control';

// Mirrors the financial capabilities required by assert_transfer_entry_access.
// The RPC additionally authorizes the destination class and its polo.
export const canReceivePlannedExternalTransfer = (permissions: GestorPermissions) => (
  canAccessGestaoTurmaTab(permissions, 'financeiro')
  && canAccessGestorModule(permissions, 'financeiro')
  && canAccessFinanceiroTab(permissions, 'receber')
);

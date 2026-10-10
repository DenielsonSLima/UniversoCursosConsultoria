import { baneseCancellationLabel } from '../../../../../../financeiro/financeiro.operation-capabilities';
import { hasProescEvidence } from '../../../../../../financeiro/financeiro.proesc-evidence';
import { isProescFinancialComposition } from '../../../../../../financeiro/financeiro.composition-presentation';
import { isBaneseIdentityQuarantined } from '../../../../../../financeiro/receber/components/modalidade-receber/modalidade-receber.utils';
import type { AlunoExtratoRecebivel } from './alunoExtrato.mapper';

// Business capabilities do not replace the operator's permission to receive.
export const canSettleExtratoReceivable = (item: AlunoExtratoRecebivel, permission: boolean) => (
  permission
  && Boolean(item.id && item.poloId)
  && ['PENDENTE', 'VENCIDO'].includes(item.status)
  && item.operationCapabilities?.canSettle === true
  && !['PROESC', 'CONFLICT'].includes(item.operationCapabilities.sourceSystem)
  && !hasProescEvidence(item)
  && !isProescFinancialComposition(item.composicaoStatus)
  && !baneseCancellationLabel(item)
  && !isBaneseIdentityQuarantined(item)
);

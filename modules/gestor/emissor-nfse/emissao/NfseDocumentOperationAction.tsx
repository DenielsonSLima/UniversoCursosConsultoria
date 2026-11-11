import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseDocument } from '../types/nfse.types';
import { useNfseTabContext } from '../components/NfseTabContext';
import { invalidateNfseCache } from '../queries/nfse-cache';
import NfseSourceEmissionModal from './NfseSourceEmissionModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import NfseDocumentOperationMenu, { type NfseDocumentExtraAction } from './NfseDocumentOperationMenu';

export default function NfseDocumentOperationAction({ document, disabled, extraAction }: { document: NfseDocument; disabled: boolean; extraAction?: NfseDocumentExtraAction }) {
  const { scope } = useNfseTabContext(), client = useQueryClient();
  const [intent, setIntent] = useState<'CONSULT' | 'CANCEL' | null>(null);
  const { toasts, removeToast, toast } = useToast();
  const canConsult = Boolean(document.operationId && document.sourceKind && document.sourceId && document.amount);
  if (!scope || !canConsult && !extraAction) return null;
  return <><ToastNotification toasts={toasts} onRemove={removeToast} />
    <NfseDocumentOperationMenu number={document.number} disabled={disabled} canConsult={canConsult} canCancel={canConsult && document.status === 'EMITIDA' && document.state !== 'CANCELLED'}
      onConsult={() => setIntent('CONSULT')} onCancel={() => setIntent('CANCEL')} extraAction={extraAction} />
    {intent && canConsult && <NfseSourceEmissionModal scope={scope} source={{ kind: document.sourceKind!, id: document.sourceId! }} intent={intent}
      label={document.studentName} amount={document.amount!} operation={document} onClose={() => setIntent(null)}
      onNotice={notice => toast[notice.type](notice.title, notice.message)}
      onChanged={() => { void invalidateNfseCache(client, scope, 'operations'); }} />}</>;
}

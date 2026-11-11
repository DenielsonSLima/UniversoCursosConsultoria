import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseDocument } from '../types/nfse.types';
import { useNfseTabContext } from '../components/NfseTabContext';
import { invalidateNfseCache } from '../queries/nfse-cache';
import NfseSourceEmissionModal from './NfseSourceEmissionModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import NfseDocumentOperationMenu from './NfseDocumentOperationMenu';

export default function NfseDocumentOperationAction({ document, disabled }: { document: NfseDocument; disabled: boolean }) {
  const { scope } = useNfseTabContext(), client = useQueryClient();
  const [intent, setIntent] = useState<'CONSULT' | 'CANCEL' | null>(null);
  const { toasts, removeToast, toast } = useToast();
  if (!scope || !document.operationId || !document.sourceKind || !document.sourceId || !document.amount) return null;
  return <><ToastNotification toasts={toasts} onRemove={removeToast} />
    <NfseDocumentOperationMenu number={document.number} disabled={disabled} canCancel={document.status === 'EMITIDA' && document.state !== 'CANCELLED'}
      onConsult={() => setIntent('CONSULT')} onCancel={() => setIntent('CANCEL')} />
    {intent && <NfseSourceEmissionModal scope={scope} source={{ kind: document.sourceKind, id: document.sourceId }} intent={intent}
      label={document.studentName} amount={document.amount} operation={document} onClose={() => setIntent(null)}
      onNotice={notice => toast[notice.type](notice.title, notice.message)}
      onChanged={() => { void invalidateNfseCache(client, scope, 'operations'); }} />}</>;
}

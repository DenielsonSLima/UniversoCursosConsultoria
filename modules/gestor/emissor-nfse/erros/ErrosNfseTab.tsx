import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import ConfirmModal from '../../components/ConfirmModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import NfseDocumentsList from '../components/NfseDocumentsList';
import { useNfseTabContext } from '../components/NfseTabContext';
import NfseDocumentOperationAction from '../emissao/NfseDocumentOperationAction';
import { canChangeNfseErrorArchive, createNfseErrorArchiveAttempt, type NfseErrorArchiveAction } from './nfse-error-archive.contract';
import { useNfseErrorArchive } from './useNfseErrorArchive';

export default function ErrosNfseTab() {
  const { scope, canRead } = useNfseTabContext();
  const [mode, setMode] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const scopeKey = JSON.stringify([scope, mode]), action: NfseErrorArchiveAction = mode === 'ACTIVE' ? 'ARCHIVE' : 'RESTORE';
  const [selection, setSelection] = useState<{ scopeKey: string; ids: ReadonlySet<string> }>({ scopeKey, ids: new Set() });
  const [confirmation, setConfirmation] = useState<{ scopeKey: string; ids: string[]; action: NfseErrorArchiveAction } | null>(null);
  const mutation = useNfseErrorArchive(scope), submitting = useRef(false), mounted = useRef(true);
  const currentScope = useRef(scopeKey); currentScope.current = scopeKey;
  const attempt = useRef(createNfseErrorArchiveAttempt());
  const { toasts, removeToast, toast } = useToast();
  const ids = selection.scopeKey === scopeKey ? selection.ids : new Set<string>();
  const reset = () => setSelection({ scopeKey, ids: new Set() });
  const busy = mutation.isPending;
  const label = action === 'ARCHIVE' ? 'Remover da lista' : 'Restaurar';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const confirm = async () => {
    if (!scope || !canRead || !confirmation || confirmation.scopeKey !== scopeKey || submitting.current) return;
    submitting.current = true;
    try {
      const input = attempt.current.get({ ...scope }, confirmation.action, [...confirmation.ids]);
      const { result } = await mutation.mutateAsync(input);
      attempt.current.confirm(input.requestId);
      if (mounted.current && currentScope.current === confirmation.scopeKey) {
        reset(); setConfirmation(null);
        toast.success(result.action === 'ARCHIVE' ? 'Erros removidos da lista' : 'Erros restaurados',
          `${result.changedCount} registro(s) atualizado(s). O histórico fiscal foi preservado.`);
      }
    } catch (error) {
      if (mounted.current && currentScope.current === confirmation.scopeKey) {
        toast.error('Atualização não confirmada', error instanceof Error ? error.message : 'Confira a seleção e tente novamente.');
      }
    } finally { submitting.current = false; }
  };
  return <>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <div key={mode}><NfseDocumentsList status="ERRO" errorArchiveMode={mode} title="Erros de emissão"
      description="Rejeições definitivas podem ser arquivadas e restauradas, preservando o histórico fiscal."
      emptyTitle={mode === 'ARCHIVED' ? 'Nenhum erro arquivado neste período' : 'Nenhum erro registrado neste período'}
      emptyDescription="Consulte a situação da operação antes de uma nova tentativa."
      actions={<div className="nfse-field min-w-[180px]"><label htmlFor="nfse-error-archive-mode">Mostrar erros</label>
        <InstitutionalSelect id="nfse-error-archive-mode" ariaLabel="Mostrar erros" value={mode} disabled={busy}
          options={[{ value: 'ACTIVE', label: 'Ativos' }, { value: 'ARCHIVED', label: 'Arquivados' }]}
          onValueChange={value => { if (value === 'ACTIVE' || value === 'ARCHIVED') { reset(); setConfirmation(null); setMode(value); } }} /></div>}
      selection={{ ids, disabled: busy, isSelectable: document => canChangeNfseErrorArchive(document, action), onReset: reset,
        onTogglePage: (documents, checked) => setSelection({ scopeKey, ids: new Set(checked ? documents.map(document => document.id) : []) }),
        onToggle: (document, checked) => { const next = new Set(ids); if (checked) next.add(document.id); else next.delete(document.id); setSelection({ scopeKey, ids: next }); } }}
      selectionActions={(documents, available) => {
        const eligible = documents.filter(document => canChangeNfseErrorArchive(document, action));
        return <button type="button" className="nfse-button nfse-button-secondary" disabled={!scope || !available || !eligible.length || busy}
          onClick={() => setConfirmation({ scopeKey, action, ids: eligible.map(document => document.id) })}>
          {action === 'ARCHIVE' ? <Archive size={15} /> : <ArchiveRestore size={15} />}{label} ({eligible.length})</button>;
      }}
      operationActions={(document, available) => <NfseDocumentOperationAction document={document} disabled={!available || busy}
        extraAction={canChangeNfseErrorArchive(document, action) ? { label, onAction: () => setConfirmation({ scopeKey, action, ids: [document.id] }) } : undefined} />} /></div>
    <ConfirmModal isOpen={Boolean(confirmation && confirmation.scopeKey === scopeKey)}
      onClose={() => { if (!submitting.current) setConfirmation(null); }} onConfirm={() => void confirm()}
      title={confirmation?.action === 'RESTORE' ? 'Restaurar erros na lista?' : 'Remover erros da lista?'}
      message={confirmation?.action === 'RESTORE'
        ? `Restaurar ${confirmation.ids.length} registro(s) para a lista de erros ativos, preservando o histórico fiscal?`
        : `Arquivar ${confirmation?.ids.length ?? 0} rejeição(ões) definitiva(s)? O histórico fiscal será preservado e os registros poderão ser restaurados em Arquivados.`}
      confirmText={busy ? 'Atualizando…' : confirmation?.action === 'RESTORE' ? 'Restaurar' : 'Remover da lista'}
      cancelText="Voltar" variant={confirmation?.action === 'RESTORE' ? 'info' : 'warning'} />
  </>;
}

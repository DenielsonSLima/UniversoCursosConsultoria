import React, { Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { financeiroService } from '../../financeiro.service';
import { financeiroQueryKeys } from '../../financeiro.queryKeys';
import { useParceirosMutations } from '../../../parceiros/hooks/useParceirosMutations';
import ToastNotification, { useToast } from '../../../parceiros/components/shared/ToastNotification';
import type { DespesaCredorTipo } from './DespesaCredorPicker';

const ParceiroFormHost = React.lazy(() => import('../../../parceiros/components/ParceiroFormHost'));
const formByTipo = { Aluno: 'aluno', Professor: 'professor', PJ: 'pj', PF: 'pf' } as const;
const ignoreStateChange = () => {};

interface Props {
  tipo: DespesaCredorTipo;
  poloId: string;
  onClose: () => void;
  onCreated: (parceiro: any) => void;
}

const DespesaNovoCredorModal: React.FC<Props> = ({ tipo, poloId, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const dialogRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const [savedPartner, setSavedPartner] = useState<any>(null);
  const mutations = useParceirosMutations({
    toast,
    createdAlunoNome: '',
    setCreatedAlunoNome: ignoreStateChange,
    setShowForm: ignoreStateChange,
    setShowEnrollmentModalForAlunoId: ignoreStateChange,
    setSelectedTurmaIdForEnrollment: ignoreStateChange,
    setDeletingParceiro: ignoreStateChange,
  });
  const busy = finishing || mutations.saveAlunoMutation.isPending
    || mutations.saveProfessorMutation.isPending || mutations.savePFMutation.isPending
    || mutations.savePJMutation.isPending;
  const close = () => { if (!savingRef.current) onClose(); };

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const save = async (data: any) => {
    if (savingRef.current) return;
    savingRef.current = true;
    let created: any = savedPartner;
    try {
      if (!created) {
        const mutation = tipo === 'Aluno' ? mutations.saveAlunoMutation
          : tipo === 'Professor' ? mutations.saveProfessorMutation
            : tipo === 'PJ' ? mutations.savePJMutation : mutations.savePFMutation;
        created = await mutation.mutateAsync(data);
        setSavedPartner(created);
      }
    } catch {
      // The existing partner mutation presents its canonical error through useToast.
      savingRef.current = false;
      return;
    }
    setFinishing(true);
    try {
      const queryKey = financeiroQueryKeys.parceirosByPolo(poloId);
      await queryClient.invalidateQueries({ queryKey, exact: true, refetchType: 'none' });
      const allowed = await queryClient.fetchQuery({
        queryKey,
        queryFn: () => financeiroService.getParceiros(poloId),
        staleTime: 0,
      });
      const credor = allowed.find((item: any) => item.id === created.id);
      if (!credor) {
        toast.error('Cadastro salvo, vínculo indisponível',
          'O parceiro foi cadastrado, mas não está disponível como credor neste polo. Confira o escopo em Parceiros.');
        return;
      }
      onCreated(credor);
    } catch (error) {
      toast.error('Cadastro salvo, atualização pendente', error instanceof Error
        ? error.message : 'Não foi possível atualizar os credores. Reabra a lista antes de selecionar o parceiro.');
    } finally {
      savingRef.current = false;
      setFinishing(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const root = dialogRef.current;
    if (!root) return;
    const nested = root.querySelector<HTMLElement>('.partner-registration-auxiliary [role="dialog"]');
    if (event.key === 'Escape' && !nested) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key !== 'Tab') return;
    const focusRoot: HTMLElement = nested || root;
    const focusable = Array.from<HTMLElement>(focusRoot.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    )).filter((item) => item.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first) { event.preventDefault(); root.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  return createPortal(<div className="fixed inset-0 z-[210] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-6"
    onKeyDown={handleKeyDown} onSubmit={(event) => event.stopPropagation()}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cadastrar novo credor"
      aria-busy={busy || undefined} tabIndex={-1}
      className="max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-xl bg-white outline-none">
      <fieldset disabled={busy || Boolean(savedPartner)} className="min-w-0 border-0 p-0">
        <Suspense fallback={<p role="status" className="p-6 text-sm text-slate-500">Carregando cadastro…</p>}>
          <ParceiroFormHost showForm={formByTipo[tipo]} onCancel={close}
            onSaveAluno={save} onSaveProfessor={(data) => { void save(data); }}
            onSavePF={(data) => { void save(data); }} onSavePJ={(data) => { void save(data); }}
            isSavingAluno={busy} isSavingProfessor={busy} defaultPoloId={poloId}
            onScopeError={(message) => toast.error('Confira o polo', message)} />
        </Suspense>
      </fieldset>
      {busy ? <p role="status" className="px-5 pb-3 text-sm text-slate-500">Salvando cadastro…</p> : null}
      {savedPartner && !busy ? <div className="border-t border-slate-200 p-5 text-sm text-slate-600">
        <p>Cadastro salvo. Atualize a lista para selecionar o parceiro na despesa.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => { void save(null); }}
            className="rounded-lg bg-[#001a33] px-3 py-2 text-white">Atualizar lista</button>
          <button type="button" onClick={close}
            className="rounded-lg border border-slate-200 px-3 py-2">Voltar à despesa</button>
        </div>
      </div> : null}
    </div>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </div>, document.body);
};

export default DespesaNovoCredorModal;

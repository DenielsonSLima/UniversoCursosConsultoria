import React, { useRef, useState } from 'react';
import { ArchiveRestore, ClipboardCheck, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { TurmaAtividadeExtraClasse } from '../../turma-grade.types';
import type { Turma } from '../../../../gestao.types';
import { academicLifecycleKeys } from '../../academic-lifecycle.keys';
import { diarioClasseKeys } from '../diarios/diario-classe.keys';
import { gestaoQueryKeys } from '../../../../gestao.query-keys';
import { atividadesExtraClasseKeys } from '../atividades-extra/atividadesExtraClasse.service';
import { formatAtividadeDate, getAtividadeErrorMessage, normalizeAtividadeErrorMessage } from '../atividades-extra/atividadesExtraClasse.utils';
import ToastNotification, { useToast } from '../../../../../parceiros/components/shared/ToastNotification';
import { formatGradeHours } from './turma-grade-ui';
import { getTurmaAtividadeCapabilities } from './turma-grade-atividade.utils';
import { manageTurmaAtividade, type TurmaAtividadeManagementInput } from './turma-grade-atividade.service';
import TurmaGradeAtividadeEditor from './TurmaGradeAtividadeEditor';

interface Props { atividades: TurmaAtividadeExtraClasse[] }

const TurmaGradeAtividades: React.FC<Props> = ({ atividades }) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [editingActivity, setEditingActivity] = useState<TurmaAtividadeExtraClasse | null>(null);
  const [archiveActivity, setArchiveActivity] = useState<TurmaAtividadeExtraClasse | null>(null);
  const pendingRef = useRef(false);
  const invalidate = async (atividade: TurmaAtividadeExtraClasse) => {
    const contexto = atividade.contexto;
    if (!contexto) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.grade(contexto.turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.atividades(contexto.turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.diarios(contexto.turmaId) }),
      queryClient.invalidateQueries({ queryKey: academicLifecycleKeys.resumo(contexto.turmaId) }),
      // Prefixo: os dados da aba Atividades acrescentam 'list' à chave da turma.
      queryClient.invalidateQueries({ queryKey: atividadesExtraClasseKeys.turma(contexto.turmaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.resultadosByTurma(contexto.turmaId) }),
      queryClient.invalidateQueries({ queryKey: diarioClasseKeys.praticasByTurma(contexto.turmaId) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.classesByModality(contexto.modalidade as Turma['modalidade']) }),
      queryClient.invalidateQueries({ queryKey: gestaoQueryKeys.activeClassesRoot() }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: manageTurmaAtividade,
    onSuccess: async (_data, input) => {
      await invalidate(input.atividade);
      setEditingActivity(null);
      setArchiveActivity(null);
      toast.success(
        input.acao === 'EDITAR' ? 'Atividade atualizada' : input.acao === 'ARQUIVAR' ? 'Atividade arquivada' : 'Atividade restaurada',
        input.acao === 'ARQUIVAR'
          ? 'Você pode recuperá-la em Atividades arquivadas. Respostas e notas foram preservadas.'
          : 'A grade foi atualizada com os dados confirmados pelo servidor.',
      );
    },
    onError: (error, input) => {
      toast.error('Alteração não salva', normalizeAtividadeErrorMessage(getAtividadeErrorMessage(error)) || 'Não consegui alterar a atividade. Tente novamente.');
      void invalidate(input.atividade);
    },
  });
  const manage = async (input: TurmaAtividadeManagementInput) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try { await mutation.mutateAsync(input); } finally { pendingRef.current = false; }
  };
  const active = atividades.filter((atividade) => atividade.status !== 'ARQUIVADA');
  const archived = atividades.filter((atividade) => atividade.status === 'ARQUIVADA');
  const busy = mutation.isPending;
  const renderRow = (atividade: TurmaAtividadeExtraClasse, index: number) => {
    const isArchived = atividade.status === 'ARQUIVADA';
    const capabilities = getTurmaAtividadeCapabilities(atividade);
    if (editingActivity?.id === atividade.id && capabilities.canEdit) {
      return <TurmaGradeAtividadeEditor key={atividade.id} atividade={atividade} pending={busy} revisionChanged={editingActivity.updatedAt !== atividade.updatedAt} onCancel={() => setEditingActivity(null)} onSave={(draft) => manage({ atividade: editingActivity, acao: 'EDITAR', draft })} />;
    }
    return (
      <div key={atividade.id} className={`space-y-1 rounded-r-xl border-y border-r border-l-2 px-3 py-2 shadow-sm ${isArchived ? 'border-slate-200 bg-slate-50' : 'border-emerald-100 border-l-emerald-400 bg-emerald-50/50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ClipboardCheck size={13} className="shrink-0 text-emerald-600" />
            <span className="font-bold text-emerald-900">{isArchived ? 'Arquivada' : `Extra ${index + 1}`}</span>
            <span className="rounded border border-emerald-200/70 bg-emerald-100/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">{formatAtividadeDate(atividade.prazoEntrega)}</span>
            <span className="rounded border border-emerald-200 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-800">{formatGradeHours(atividade.cargaHoraria)}h</span>
            {(atividade.status === 'RASCUNHO' || (isArchived && capabilities.estadoOriginal === 'RASCUNHO')) && <span className="text-[10px] font-bold text-slate-500">Rascunho</span>}
          </div>
          <div className="flex items-center gap-1">
            {capabilities.canManage ? isArchived ? (
              <button type="button" disabled={busy} onClick={() => { void manage({ atividade, acao: 'RESTAURAR' }).catch(() => undefined); }} className="inline-flex items-center gap-1 rounded p-1 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50" aria-label={`Restaurar atividade ${atividade.titulo}`}>
                {busy && mutation.variables?.atividade.id === atividade.id ? <Loader2 size={14} className="animate-spin" /> : <ArchiveRestore size={14} />} {capabilities.estadoOriginal === 'RASCUNHO' ? 'Restaurar rascunho' : 'Restaurar'}
              </button>
            ) : (
              <>
                <button type="button" disabled={busy || !capabilities.canEdit} onClick={() => { setArchiveActivity(null); setEditingActivity(atividade); }} title={capabilities.canEdit ? 'Editar atividade' : 'Atividade com respostas: conteúdo, prazo e carga estão protegidos'} aria-label={`Editar atividade ${atividade.titulo}`} className="rounded p-1 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40"><Pencil size={14} /></button>
                <button type="button" disabled={busy} onClick={() => { setEditingActivity(null); setArchiveActivity(atividade); }} title="Excluir da grade (arquivar)" aria-label={`Excluir atividade ${atividade.titulo} da grade`} aria-expanded={archiveActivity?.id === atividade.id} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"><Trash2 size={14} /></button>
              </>
            ) : <span className="text-[10px] text-slate-500">{isArchived && !atividade.statusAnterior ? 'Origem não registrada: restauração indisponível' : 'Somente consulta'}</span>}
          </div>
        </div>
        <div className="break-words pl-5 text-xs leading-relaxed text-slate-700">{atividade.titulo}</div>
        {!isArchived && Boolean(atividade.respostasCount) && <p className="pl-5 text-[10px] text-slate-500">{atividade.respostasCount} resposta(s) registrada(s). A edição está protegida.</p>}
        {archiveActivity?.id === atividade.id && capabilities.canManage && (
          <div role="group" aria-label="Confirmar arquivamento da atividade" className="mt-3 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3" onKeyDown={(event) => { if (event.key === 'Escape' && !busy) setArchiveActivity(null); }}>
            <p className="text-xs font-bold text-slate-800">Excluir esta atividade da grade?</p>
            <p className="text-xs leading-relaxed text-slate-600">A atividade será arquivada e sairá do portal dos alunos. Sua carga horária deixará de compor os totais. Respostas e notas serão preservadas, e você poderá restaurá-la abaixo.</p>
            {archiveActivity.updatedAt !== atividade.updatedAt && <p role="alert" className="text-xs font-bold text-amber-800">A atividade foi alterada. Cancele esta confirmação e revise os dados atuais antes de arquivar.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setArchiveActivity(null)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={busy || archiveActivity.updatedAt !== atividade.updatedAt} onClick={() => { void manage({ atividade: archiveActivity, acao: 'ARQUIVAR' }).catch(() => undefined); }} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy && <Loader2 size={13} className="animate-spin" />} Arquivar atividade</button>
            </div>
          </div>
        )}
      </div>
    );
  };
  return (
    <>
      {active.map(renderRow)}
      {archived.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-3"><summary className="cursor-pointer text-xs font-bold text-slate-500">Atividades arquivadas ({archived.length})</summary><div className="mt-3 space-y-2">{archived.map(renderRow)}</div></details>}
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default TurmaGradeAtividades;

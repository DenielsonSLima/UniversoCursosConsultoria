import React, { useId, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Clock3,
  Eye,
  FileSignature,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type {
  ElectronicSignatureAudience,
  ElectronicSignatureInboxItem,
  ElectronicSignatureInboxTab,
  ElectronicSignatureProfile,
} from './assinatura-eletronica.contract';
import { electronicSignatureQueryKeys } from './assinatura-eletronica.contract';
import ElectronicSignatureActionModal from './ElectronicSignatureActionModal';
import { electronicSignatureService } from './assinatura-eletronica.service';

interface ElectronicSignatureInboxProps {
  audience: ElectronicSignatureAudience;
  profile: ElectronicSignatureProfile;
  contextId: string;
  heading?: string;
  compact?: boolean;
  poloId?: string | null;
}

const audienceLabels: Record<ElectronicSignatureAudience, string> = {
  gestor: 'gestão',
  professor: 'professor',
  coordenador: 'coordenador',
  aluno: 'aluno',
  responsavel: 'responsável',
};

const tabs: Array<{
  id: ElectronicSignatureInboxTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'pending', label: 'Pendentes', icon: <Clock3 size={15} /> },
  { id: 'signed', label: 'Assinados', icon: <CheckCircle2 size={15} /> },
];

const formatDateTime = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
};

const ElectronicSignatureInbox: React.FC<ElectronicSignatureInboxProps> = ({
  audience,
  profile,
  contextId,
  heading = 'Assinaturas',
  compact = false,
  poloId,
}) => {
  const tabIdPrefix = `electronic-signature-${useId().replace(/:/gu, '')}`;
  const [activeTab, setActiveTab] = useState<ElectronicSignatureInboxTab>('pending');
  const [selectedItem, setSelectedItem] = useState<ElectronicSignatureInboxItem | null>(null);
  const normalizedPoloId = poloId || null;
  const inboxQuery = useInfiniteQuery({
    queryKey: electronicSignatureQueryKeys.inbox(
      profile,
      contextId,
      normalizedPoloId,
      activeTab,
    ),
    queryFn: ({ pageParam }) => electronicSignatureService.getInboxSection({
      profile,
      contextId,
      poloId: normalizedPoloId,
      status: activeTab === 'pending' ? 'PENDENTES' : 'ASSINADOS',
      cursor: pageParam,
    }),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(contextId),
    staleTime: 30_000,
    retry: false,
  });
  const items = inboxQuery.data?.pages.flatMap((page) => page.items) || [];
  const audienceLabel = audienceLabels[audience];
  const activateTabFromKeyboard = (
    event: React.KeyboardEvent,
    currentIndex: number,
  ) => {
    let targetIndex: number | null = null;
    if (event.key === 'ArrowRight') targetIndex = (currentIndex + 1) % tabs.length;
    if (event.key === 'ArrowLeft') targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') targetIndex = 0;
    if (event.key === 'End') targetIndex = tabs.length - 1;
    if (targetIndex === null) return;
    event.preventDefault();
    const targetTab = tabs[targetIndex];
    setActiveTab(targetTab.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`${tabIdPrefix}-${targetTab.id}-tab`)?.focus();
    });
  };

  return (
    <>
      <section className={`overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm ${compact ? '' : 'shadow-slate-900/[0.03]'}`}>
        <div className={`flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-[#001a33] to-[#123a61] text-white ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-200 ring-1 ring-white/15">
                <FileSignature size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Assinatura eletrônica</p>
                <h3 className="mt-0.5 text-base font-black tracking-tight text-white">{heading}</h3>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">A caixa é preenchida pelo serviço autorizado para este perfil.</p>
              </div>
            </div>
            <ShieldCheck size={19} className="mt-1 shrink-0 text-blue-200" aria-hidden="true" />
          </div>

          <div className="flex w-full gap-2 rounded-xl border border-white/10 bg-slate-950/20 p-1" role="tablist" aria-label="Status das assinaturas">
            {tabs.map((tab, tabIndex) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`${tabIdPrefix}-${tab.id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={`${tabIdPrefix}-${tab.id}-panel`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => activateTabFromKeyboard(event, tabIndex)}
                  className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide transition-colors ${
                    selected
                      ? 'bg-white text-[#001a33] shadow-sm'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          id={`${tabIdPrefix}-${activeTab}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabIdPrefix}-${activeTab}-tab`}
          tabIndex={0}
          className={compact ? 'p-4' : 'p-5 sm:p-6'}
        >
          {!contextId ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-xs font-bold text-rose-700">O contexto autorizado deste perfil não foi informado. Nenhum documento foi consultado.</p>
            </div>
          ) : inboxQuery.isPending ? (
            <div className="flex min-h-28 items-center justify-center gap-3 text-xs font-bold text-slate-500" role="status">
              <Loader2 size={19} className="animate-spin text-blue-600" /> Carregando caixa de assinaturas...
            </div>
          ) : inboxQuery.isError ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-xs font-bold text-rose-700">Não foi possível consultar a caixa de assinaturas.</p>
              <button
                type="button"
                onClick={() => void inboxQuery.refetch()}
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-[10px] font-black uppercase tracking-wide text-rose-700 shadow-sm ring-1 ring-rose-100 transition-colors hover:bg-rose-100"
              >
                <RefreshCw size={13} /> Tentar novamente
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
              {activeTab === 'pending' ? <Clock3 size={22} className="text-slate-400" /> : <CheckCircle2 size={22} className="text-emerald-500" />}
              <p className="mt-2 text-xs font-black text-[#001a33]">Nenhuma assinatura {activeTab === 'pending' ? 'pendente' : 'concluída'} disponível</p>
              <p className="mt-1 max-w-md text-[11px] font-medium leading-relaxed text-slate-500">Quando houver um envelope para {audienceLabel}, ele será listado aqui pelo serviço de assinatura.</p>
            </div>
          ) : (
            <>
              <ul className="space-y-3" aria-label={`Assinaturas ${activeTab === 'pending' ? 'pendentes' : 'assinadas'}`}>
                {items.map((item) => {
                  const dateLabel = formatDateTime(item.deadlineAt || item.updatedAt);
                  const canSign = item.canAct && item.primaryAction === 'SIGN' && Boolean(item.participantId);
                  return (
                    <li key={`${item.envelopeId}:${item.participantId || 'consulta'}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[#001a33]">{item.title}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
                            {item.revisionLabel ? <span>{item.revisionLabel}</span> : null}
                            {item.participantRoleLabel ? <span>{item.participantRoleLabel}</span> : null}
                            {dateLabel ? <span>{item.deadlineAt ? `Prazo: ${dateLabel}` : `Atualizado: ${dateLabel}`}</span> : null}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-slate-600">{item.statusLabel}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-[10px] font-bold">
                        {item.participantStatusLabel ? (
                          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-blue-700">{item.participantStatusLabel}</span>
                        ) : null}
                        {item.message ? <span className="basis-full font-medium leading-relaxed text-slate-500">{item.message}</span> : null}
                        <button
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className={`ml-auto inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-black uppercase tracking-wide transition-colors ${
                            canSign
                              ? 'bg-[#001a33] text-white hover:bg-blue-900'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {canSign ? <FileSignature size={14} /> : <Eye size={14} />}
                          {canSign ? (item.primaryActionLabel || 'Assinar') : 'Ver detalhes'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {inboxQuery.hasNextPage ? (
                <div className="mt-4 flex justify-center border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => void inboxQuery.fetchNextPage()}
                    disabled={inboxQuery.isFetchingNextPage}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inboxQuery.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : null}
                    {inboxQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <ElectronicSignatureActionModal
        key={selectedItem ? `${selectedItem.envelopeId}:${selectedItem.participantId || 'consulta'}` : 'closed'}
        isOpen={Boolean(selectedItem)}
        item={selectedItem}
        profile={profile}
        contextId={contextId}
        poloId={normalizedPoloId}
        onClose={() => setSelectedItem(null)}
      />
    </>
  );
};

export default ElectronicSignatureInbox;

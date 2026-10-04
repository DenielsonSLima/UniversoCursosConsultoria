import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Globe2, MessageCircle, MessagesSquare, Radio, Smartphone, X } from 'lucide-react';
import type { PortalAuthProfile } from '../../login/portal-session';
import ComunicacaoPage from './ComunicacaoPage';
import UnifiedSupportInbox from './UnifiedSupportInbox';
import UnifiedWhatsAppDetail from './UnifiedWhatsAppDetail';
import {
  filterUnifiedSupportItems,
  type UnifiedSupportChannel,
  type UnifiedSupportItem,
  type UnifiedSupportStatus,
} from './unified-support-inbox.model';
import {
  setUnifiedSupportActive,
  setUnifiedSupportSelection,
  requestUnifiedInternalStart,
  subscribeUnifiedSupportOpened,
  subscribeUnifiedSupportStartClosed,
} from './unified-support-selection';
import { useUnifiedSupportInbox } from './useUnifiedSupportInbox';

interface UnifiedCommunicationPageProps {
  gestorProfile: PortalAuthProfile;
  canAccessInternal: boolean;
  canAccessWhatsApp: boolean;
}

const EmptyStateIcon = () => (
  <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-300">
    <MessagesSquare size={26} />
  </span>
);

const UnifiedCommunicationPage: React.FC<UnifiedCommunicationPageProps> = ({
  gestorProfile,
  canAccessInternal,
  canAccessWhatsApp,
}) => {
  const { items, categories, connections, loading, error } = useUnifiedSupportInbox({ canAccessInternal, canAccessWhatsApp });
  const [status, setStatus] = useState<UnifiedSupportStatus>('open');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [bulkConnectionId, setBulkConnectionId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const inboxBeforeStart = useRef<{
    selectedKey: string | null; status: UnifiedSupportStatus; search: string; categoryId: string | null;
  }>({ selectedKey: null, status: 'open', search: '', categoryId: null });
  const [startChooserOpen, setStartChooserOpen] = useState(false);
  const [pendingStartChannel, setPendingStartChannel] = useState<UnifiedSupportChannel | null>(null);
  const [heldDetailChannel, setHeldDetailChannel] = useState<UnifiedSupportChannel | null>(null);
  const [detailChannel, setDetailChannel] = useState<UnifiedSupportChannel>(
    canAccessInternal ? 'internal' : 'whatsapp',
  );
  const filteredItems = useMemo(
    () => filterUnifiedSupportItems(items, status, search, categoryId),
    [items, search, status, categoryId],
  );
  const selectedItem = items.find((item) => item.key === selectedKey) || null;
  const openCount = items.filter((item) => item.status === 'open').length;
  const closedCount = items.filter((item) => item.status === 'closed').length;
  const accessibleChannels = canAccessInternal && canAccessWhatsApp
    ? 'Portal, App e WhatsApp'
    : canAccessInternal ? 'Portal e App' : 'WhatsApp';

  useEffect(() => {
    setUnifiedSupportActive(true);
    return () => {
      setUnifiedSupportSelection(null);
      setUnifiedSupportActive(false);
    };
  }, []);

  useEffect(() => subscribeUnifiedSupportOpened((selection) => {
    setSelectedKey(selection.channel === 'internal' ? `internal:${selection.conversationId}` : `whatsapp:${selection.connectionId}:${selection.conversationId}`);
    setHeldDetailChannel(selection.channel);
    setDetailChannel(selection.channel);
    setPendingStartChannel(null);
  }), []);

  const restoreInboxAfterStart = useCallback(() => {
    const previous = inboxBeforeStart.current;
    setSelectedKey(previous.selectedKey);
    setStatus(previous.status);
    setSearch(previous.search);
    setCategoryId(previous.categoryId);
    setHeldDetailChannel(null);
    setPendingStartChannel(null);
  }, []);

  useEffect(() => subscribeUnifiedSupportStartClosed(restoreInboxAfterStart), [restoreInboxAfterStart]);

  useEffect(() => {
    if (pendingStartChannel || heldDetailChannel) return;
    if (selectedKey && filteredItems.some((item) => item.key === selectedKey)) return;
    const next = filteredItems[0] || null;
    setSelectedKey(next?.key || null);
    if (next) setDetailChannel(next.channel);
  }, [filteredItems, heldDetailChannel, pendingStartChannel, selectedKey]);

  useEffect(() => {
    if (!selectedItem) {
      setUnifiedSupportSelection(null);
      return;
    }
    setDetailChannel(selectedItem.channel);
    setHeldDetailChannel(null);
    setUnifiedSupportSelection({
      channel: selectedItem.channel,
      conversationId: selectedItem.conversationId,
      connectionId: selectedItem.connectionId,
    });
  }, [selectedItem]);

  const selectItem = (item: UnifiedSupportItem) => {
    setHeldDetailChannel(null);
    setPendingStartChannel(null);
    setSelectedKey(item.key);
    setDetailChannel(item.channel);
    if (item.channel !== 'whatsapp' || item.connectionId !== bulkConnectionId) {
      setBulkIds(new Set());
      setBulkConnectionId(null);
    }
  };

  useEffect(() => {
    if (pendingStartChannel === 'internal' && detailChannel === 'internal' && requestUnifiedInternalStart()) {
      setPendingStartChannel(null);
    }
  }, [detailChannel, pendingStartChannel]);

  const launchStart = (channel: UnifiedSupportChannel) => {
    inboxBeforeStart.current = { selectedKey, status, search, categoryId };
    setStartChooserOpen(false);
    setSearch('');
    setCategoryId(null);
    setBulkIds(new Set());
    setBulkConnectionId(null);
    setStatus('open');
    setSelectedKey(null);
    setHeldDetailChannel(channel);
    setDetailChannel(channel);
    setUnifiedSupportSelection(null);
    setPendingStartChannel(channel);
  };

  const startConversation = () => {
    if (canAccessInternal && canAccessWhatsApp) {
      setStartChooserOpen(true);
      return;
    }
    launchStart(canAccessInternal ? 'internal' : 'whatsapp');
  };

  const changeStatus = (nextStatus: UnifiedSupportStatus) => {
    setHeldDetailChannel(null);
    setPendingStartChannel(null);
    setStatus(nextStatus);
    setBulkIds(new Set());
    setBulkConnectionId(null);
  };

  const selectCreatedWhatsApp = (conversationId: string, connectionId: string) => {
    setSelectedKey(`whatsapp:${connectionId}:${conversationId}`);
    setHeldDetailChannel('whatsapp');
    setDetailChannel('whatsapp');
    setPendingStartChannel(null);
  };

  const toggleBulk = (item: UnifiedSupportItem) => {
    const next = new Set(item.connectionId === bulkConnectionId ? bulkIds : []);
    if (next.has(item.conversationId)) next.delete(item.conversationId);
    else next.add(item.conversationId);
    selectItem(item);
    setBulkIds(next);
    setBulkConnectionId(next.size > 0 ? item.connectionId : null);
  };

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[620px] flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <header className="relative shrink-0 overflow-hidden border-b border-[#173756] bg-[#001a33] px-5 py-5 text-white sm:px-7">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_20%_0%,rgba(47,108,255,.7),transparent_35%),linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:auto,28px_28px,28px_28px]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500 text-white shadow-lg shadow-blue-950/30"><MessagesSquare size={21} /></span>
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-black tracking-tight sm:text-2xl">Central de Atendimento</h1><span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/20"><Radio size={10} /> Em tempo real</span></div>
              <p className="mt-1 text-xs font-medium text-slate-300">Todas as conversas do portal, app e WhatsApp em uma única fila.</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-3.5 py-2 ring-1 ring-inset ring-white/15" aria-label={`Fila unificada de ${accessibleChannels}`}>
            <span className="flex -space-x-1.5" aria-hidden="true">
              {canAccessInternal && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#16334f] bg-blue-500 text-white"><Globe2 size={13} /></span>}
              {canAccessInternal && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#16334f] bg-blue-400 text-white"><Smartphone size={12} /></span>}
              {canAccessWhatsApp && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#16334f] bg-emerald-500"><img src="/logos/whatsapp.svg" alt="" className="h-3.5 w-3.5 brightness-0 invert" /></span>}
            </span>
            <span><span className="block text-xs font-black text-white">Fila unificada</span><span className="block text-[10px] font-semibold text-slate-300">{accessibleChannels}</span></span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <UnifiedSupportInbox
          filteredItems={filteredItems}
          hasLoadError={Boolean(error)}
          loading={loading}
          openCount={openCount}
          closedCount={closedCount}
          search={search}
          selectedKey={selectedKey}
          status={status}
          categories={categories}
          categoryId={categoryId}
          bulkIds={bulkIds}
          bulkConnectionId={bulkConnectionId}
          canSelectWhatsApp={canAccessWhatsApp}
          onCategoryChange={(id) => { setCategoryId(id); setHeldDetailChannel(null); setBulkIds(new Set()); setBulkConnectionId(null); }}
          onToggleBulk={toggleBulk}
          onSearchChange={(value) => { setSearch(value); setHeldDetailChannel(null); }}
          onSelect={selectItem}
          onStart={startConversation}
          onStatusChange={changeStatus}
        />
        <div className="unified-support-detail min-w-0 flex-1 overflow-hidden">
          {!loading && items.length > 0 && !selectedItem && !heldDetailChannel ? (
            <div className="flex h-full items-center justify-center bg-slate-50 px-8 text-center"><div><EmptyStateIcon /><p className="mt-3 text-sm font-bold text-slate-600">Nenhuma conversa neste filtro</p><p className="mt-1 text-xs font-medium text-slate-400">Altere o filtro ou faça uma nova busca.</p></div></div>
          ) : detailChannel === 'internal' && canAccessInternal ? (
            <ComunicacaoPage gestorProfile={gestorProfile} channel="mensagem" embedded />
          ) : canAccessWhatsApp ? (
            <UnifiedWhatsAppDetail
              connections={connections}
              selection={selectedItem?.channel === 'whatsapp' ? selectedItem : null}
              startOpen={pendingStartChannel === 'whatsapp'}
              selectedIds={bulkIds}
              onSelectionChange={(ids) => { setBulkIds(ids); if (ids.size === 0) setBulkConnectionId(null); }}
              onStartClose={restoreInboxAfterStart}
              onCreated={selectCreatedWhatsApp}
              onConnectionChange={() => { setSelectedKey(null); setHeldDetailChannel('whatsapp'); setBulkIds(new Set()); setBulkConnectionId(null); }}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-slate-50 text-sm font-semibold text-slate-400">Nenhum canal disponível.</div>
          )}
        </div>
      </div>

      {startChooserOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unified-start-title"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-[#001a33]/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setStartChooserOpen(false); }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/80 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 id="unified-start-title" className="text-lg font-black text-[#001a33]">Iniciar conversa</h2>
                <p className="mt-1 text-xs font-medium text-slate-500">Escolha por onde o atendimento será iniciado.</p>
              </div>
              <button type="button" onClick={() => setStartChooserOpen(false)} aria-label="Fechar" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <button type="button" onClick={() => launchStart('internal')} className="group rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:shadow-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><MessagesSquare size={18} /></span>
                <span className="mt-3 block text-sm font-black text-[#001a33]">Portal e app</span>
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">Atendimento interno para alunos no portal.</span>
              </button>
              <button type="button" onClick={() => launchStart('whatsapp')} className="group rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:shadow-md">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"><MessageCircle size={18} /></span>
                <span className="mt-3 block text-sm font-black text-[#001a33]">WhatsApp</span>
                <span className="mt-1 block text-xs font-medium leading-relaxed text-slate-500">Mensagem pela linha oficial configurada.</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedCommunicationPage;

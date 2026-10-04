import React from 'react';
import {
  AlertTriangle, CheckCircle2, Clock3, Globe2, ListChecks, MessageCircle, Plus, Search, Smartphone,
} from 'lucide-react';
import { formatGestorChatTime, type GestorCategory } from './gestor-comunicacao.types';
import UnifiedCategoryFilter from './UnifiedCategoryFilter';
import type {
  UnifiedSupportItem,
  UnifiedSupportStatus,
} from './unified-support-inbox.model';

interface UnifiedSupportInboxProps {
  filteredItems: UnifiedSupportItem[];
  hasLoadError: boolean;
  loading: boolean;
  openCount: number;
  closedCount: number;
  search: string;
  selectedKey: string | null;
  status: UnifiedSupportStatus;
  categories: GestorCategory[];
  categoryId: string | null;
  bulkIds: Set<string>;
  bulkConnectionId: string | null;
  canSelectWhatsApp: boolean;
  onCategoryChange: (id: string | null) => void;
  onToggleBulk: (item: UnifiedSupportItem) => void;
  onSearchChange: (value: string) => void;
  onSelect: (item: UnifiedSupportItem) => void;
  onStart: () => void;
  onStatusChange: (status: UnifiedSupportStatus) => void;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2)
  .map((part) => part[0] || '').join('').toLocaleUpperCase('pt-BR') || '?';

const SourceIcon = ({ item }: { item: UnifiedSupportItem }) => {
  if (item.source === 'whatsapp') {
    return <img src="/logos/whatsapp.svg" alt="" aria-hidden="true" className="h-3.5 w-3.5" />;
  }
  if (item.source === 'app') return <Smartphone size={13} aria-hidden="true" />;
  return <Globe2 size={13} aria-hidden="true" />;
};

const UnifiedSupportInbox: React.FC<UnifiedSupportInboxProps> = ({
  filteredItems,
  hasLoadError,
  loading,
  openCount,
  closedCount,
  search,
  selectedKey,
  status,
  categories,
  categoryId,
  bulkIds,
  bulkConnectionId,
  canSelectWhatsApp,
  onCategoryChange,
  onToggleBulk,
  onSearchChange,
  onSelect,
  onStart,
  onStatusChange,
}) => (
  <aside className="flex w-[360px] shrink-0 flex-col border-r border-slate-200 bg-white">
    <div className="space-y-3 border-b border-slate-100 p-4">
      <button
        type="button"
        onClick={onStart}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-4 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-colors hover:bg-blue-900"
      >
        <Plus size={15} /> Iniciar conversa
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onStatusChange('open')}
          className={`flex min-h-[38px] items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ${status === 'open' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
        >
          <Clock3 size={14} /> Abertas <span className="rounded-full bg-white/80 px-1.5 text-[10px]">{openCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onStatusChange('closed')}
          className={`flex min-h-[38px] items-center justify-center gap-2 rounded-xl text-xs font-bold transition-all ${status === 'closed' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
        >
          <CheckCircle2 size={14} /> Finalizadas <span className="rounded-full bg-white/80 px-1.5 text-[10px]">{closedCount}</span>
        </button>
      </div>
      <label className="relative block">
        <span className="sr-only">Buscar conversa</span>
        <input
          type="search"
          placeholder="Buscar conversa..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-11 w-full rounded-2xl border border-slate-100 bg-slate-50 pl-9 pr-10 text-sm font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-blue-200 focus:bg-white"
        />
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </label>
      {(categories.length > 0 || categoryId !== null) && <UnifiedCategoryFilter categories={categories} value={categoryId} onChange={onCategoryChange} />}
      {canSelectWhatsApp && filteredItems.some((item) => item.channel === 'whatsapp') && (
        <p className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400"><ListChecks size={12} /> Marque conversas do WhatsApp para ações em lote.</p>
      )}
    </div>

    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2 custom-scrollbar">
      {hasLoadError && (
        <div role="status" className="mx-1 mb-2 flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Algumas origens não puderam ser atualizadas. As demais continuam disponíveis.
        </div>
      )}
      {loading && filteredItems.length === 0 ? (
        <div className="flex items-center justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></div>
      ) : filteredItems.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <MessageCircle size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-bold text-slate-600">Nenhuma conversa</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-400">Não há conversas neste filtro.</p>
        </div>
      ) : filteredItems.map((item) => {
        const selected = selectedKey === item.key;
        const whatsapp = item.source === 'whatsapp';
        return (
          <div
            key={item.key}
            className={`flex w-full items-center rounded-2xl border text-left transition-all ${selected ? (whatsapp ? 'border-emerald-100 bg-emerald-50/80 shadow-sm' : 'border-blue-100 bg-blue-50/80 shadow-sm') : 'border-transparent hover:bg-slate-50'}`}
          >
            {whatsapp && canSelectWhatsApp && (
              <input type="checkbox" checked={bulkConnectionId === item.connectionId && bulkIds.has(item.conversationId)} onChange={() => onToggleBulk(item)} aria-label={`Selecionar conversa de ${item.name}`} className="ml-3 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600" />
            )}
            <button type="button" onClick={() => onSelect(item)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
            <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm ${whatsapp ? 'bg-emerald-600' : 'bg-blue-600'}`}>
              {initials(item.name)}
              <span
                title={`Origem: ${item.sourceLabel}`}
                aria-label={`Origem: ${item.sourceLabel}`}
                className={`absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${whatsapp ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}
              >
                <SourceIcon item={item} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="mb-0.5 flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-[#001a33]">
                  <span className="truncate">{item.name}</span>
                  {item.unread > 0 && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                </span>
                <span className="shrink-0 text-[10px] font-medium text-slate-400">{formatGestorChatTime(item.lastAt)}</span>
              </span>
              <span className="block truncate text-xs font-medium text-slate-500">{item.lastText}</span>
              <span className="mt-2 flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${whatsapp ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                  <SourceIcon item={item} /> {item.sourceLabel}
                </span>
                {item.connectionName && <span className="truncate text-[10px] font-semibold text-slate-400">{item.connectionName}</span>}
                {item.unread > 1 && <span className="ml-auto rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">{item.unread}</span>}
              </span>
            </span>
            </button>
          </div>
        );
      })}
    </div>
  </aside>
);

export default UnifiedSupportInbox;

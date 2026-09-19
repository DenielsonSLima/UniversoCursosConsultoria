import { useCallback, useState } from 'react';
import { Database, History, KeyRound } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import type { ProescVersion } from './proesc.service';
import ProescConnectionCard from './ProescConnectionCard';
import ProescClassHistory from './ProescResults';

const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

export default function ProescConfig() {
  const [tab, setTab] = useState<'token' | 'history'>('token');
  const [operations, setOperations] = useState({ v1: false, v2: false });
  const { toasts, removeToast, toast } = useToast();
  const onBusyChange = useCallback((version: ProescVersion, busy: boolean) => {
    setOperations((current) => ({ ...current, [version]: busy }));
  }, []);
  const busy = operations.v1 || operations.v2;

  return <div className="space-y-6">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="flex items-start gap-4 overflow-hidden rounded-[2rem] bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-blue-200"><Database size={26} /></div>
      <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-200">Integração de sistemas</p>
        <h2 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">Proesc</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">Gerencie o acesso e acompanhe o histórico das turmas.</p></div>
    </header>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Proesc">
      {([{ id: 'token', label: 'Conexões V1 e V2', Icon: KeyRound }, { id: 'history', label: 'Histórico por turma', Icon: History }] as const).map(({ id, label, Icon }) => (
        <button key={id} type="button" id={`proesc-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`proesc-panel-${id}`}
          disabled={busy} onClick={() => setTab(id)} className={`${buttonClass} shrink-0 ${tab === id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15' : 'border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}>
          <Icon size={16} />{label}
        </button>
      ))}
    </div>
    <div role="tabpanel" id={`proesc-panel-${tab}`} aria-labelledby={`proesc-tab-${tab}`}>
      {tab === 'history' ? <ProescClassHistory /> : <div className="space-y-8">
        <ProescConnectionCard version="v1" toast={toast} onBusyChange={onBusyChange} />
        <ProescConnectionCard version="v2" toast={toast} onBusyChange={onBusyChange} />
      </div>}
    </div>
  </div>;
}

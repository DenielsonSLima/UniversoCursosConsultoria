import React, { useRef, useState } from 'react';
import { AlertCircle, Check, Laptop, Loader2, Pencil, Plus, Printer, RefreshCw } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { generateSafeUuid } from '../../../../lib/randomUuid';
import { previewPdvReceiptTemplate } from '../../financeiro/outros-creditos/pdv-receipt-preview';
import { PrinterEditor } from './PrinterEditor';
import { usePrinterSettings } from './usePrinterSettings';
import type { PdvPrinter, PdvPrinterDraft } from './printer.types';

const buttonFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const behaviorLabels = { PERGUNTAR: 'Perguntar ao concluir', AUTOMATICO: 'Impressão automática', NAO: 'Não imprimir' };
const transportLabels = { BROWSER: 'Diálogo do navegador', QZ_TRAY: 'Ponte local · QZ Tray', EPOS: 'Epson ePOS · rede' };

export default function ImpressorasConfig({ poloId }: { poloId?: string | null }) {
  const model = usePrinterSettings(poloId);
  const { toasts, removeToast, toast } = useToast();
  const [editor, setEditor] = useState<{ printer: PdvPrinter | null } | null>(null);
  const [stationName, setStationName] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const registerAttempt = useRef({ name: '', id: generateSafeUuid() });
  const data = model.query.data;
  const stations = data?.workstations.filter(station => station.active && station.ownedByCurrentUser) || [];
  const station = stations.find(item => item.id === model.stationId);
  const printers = data?.printers.filter(printer => printer.workstationId === station?.id) || [];
  const busy = model.register.isPending || model.save.isPending;

  const register = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = stationName.trim();
    if (busy || !name || data?.canManage !== true) return;
    if (registerAttempt.current.name !== name) registerAttempt.current = { name, id: generateSafeUuid() };
    try {
      await model.register.mutateAsync({ poloId: model.activePolo, name, requestId: registerAttempt.current.id });
      setRegisterOpen(false); setStationName('');
      toast.success('Estação registrada', 'Selecione as impressoras deste atendimento.');
    } catch (error) { toast.error('Não foi possível registrar a estação', error instanceof Error ? error.message : 'Tente novamente.'); }
  };
  const save = async (draft: PdvPrinterDraft, requestId: string) => {
    if (!station || !editor || busy || data?.canManage !== true) return;
    try {
      await model.save.mutateAsync({ requestId, printer: {
        ...draft, id: editor.printer?.id, poloId: model.activePolo, workstationId: station.id,
        expectedVersion: editor.printer?.version || 0,
      } });
      setEditor(null);
      toast.success('Impressora salva', 'A configuração será usada nos próximos atendimentos desta estação.');
    } catch { /* Mutation error remains next to the form, preserving its draft and request ID. */ }
  };

  if (!model.activePolo) return <p className="rounded-xl bg-blue-50 p-5 text-sm text-blue-950">Selecione uma unidade no topo do portal para configurar suas impressoras.</p>;
  if (model.query.isLoading) return <p role="status" className="flex items-center gap-3 p-6 text-sm text-slate-500"><Loader2 size={20} className="animate-spin" aria-hidden="true" />Carregando impressoras...</p>;
  if (model.query.isError) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-900"><p className="font-bold">Não foi possível consultar as impressoras</p><p className="mt-2 text-sm">{model.query.error.message}</p><button type="button" disabled={model.query.isFetching} onClick={() => void model.query.refetch()} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-semibold disabled:opacity-40 ${buttonFocus}`}><RefreshCw size={16} aria-hidden="true" />Tentar novamente</button>{model.stationId && <button type="button" onClick={model.resetStation} className={`ml-2 mt-4 min-h-11 rounded-lg px-4 text-sm font-semibold ${buttonFocus}`}>Escolher outra estação</button>}</div>;
  if (!data || (!data.canManage && !data.canUse)) return <p role="alert" className="rounded-xl bg-amber-50 p-5 text-sm text-amber-950">Seu acesso não permite consultar as impressoras desta unidade.</p>;

  return (
    <div className="space-y-6 text-[#0b1f4a]">
      <ToastNotification toasts={toasts} onRemove={removeToast} />
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0b1f4a] text-white"><Printer size={24} aria-hidden="true" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Universo · Atendimento</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Impressoras</h2></div></div>
        {data.canManage && station && !editor && <button type="button" onClick={() => { model.save.reset(); setEditor({ printer: null }); }} className={`inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0b1f4a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#163768] ${buttonFocus}`}><Plus size={17} aria-hidden="true" />Nova impressora</button>}
        <p className="w-full text-sm leading-6 text-slate-500">Escolha onde imprimir e como concluir os pagamentos no PDV. Cada impressora tem seu modelo de comprovante.</p>
      </header>

      <section aria-label="Estação de atendimento" className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <Laptop size={22} className="shrink-0 text-slate-500" aria-hidden="true" />
          <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">Estação neste navegador
            <select value={station?.id || ''} disabled={busy || Boolean(editor)} onChange={event => model.selectStation(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50">
              <option value="" disabled>Selecione uma estação</option>{stations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {data.canManage && !editor && <button type="button" disabled={busy} onClick={() => setRegisterOpen(current => !current)} aria-expanded={registerOpen} className={`mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold disabled:opacity-40 ${buttonFocus}`}><Plus size={16} aria-hidden="true" />Registrar estação</button>}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">A estação identifica este ponto de atendimento na unidade. Somente estações autorizadas ao seu usuário podem ser selecionadas.</p>
        {registerOpen && data.canManage && <form onSubmit={event => void register(event)} className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-semibold text-slate-600">Nome da estação<input autoFocus required maxLength={80} disabled={busy} value={stationName} onChange={event => setStationName(event.target.value)} placeholder="Ex.: Secretaria · computador 1" className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:ring-2 focus:ring-blue-600" /></label>
          <button type="submit" disabled={busy || !stationName.trim()} className={`min-h-11 rounded-xl bg-[#0b1f4a] px-5 text-sm font-semibold text-white disabled:opacity-40 ${buttonFocus}`}>{model.register.isPending ? 'Registrando...' : 'Registrar'}</button>
          <button type="button" disabled={busy} onClick={() => setRegisterOpen(false)} className={`min-h-11 rounded-xl px-3 text-sm text-slate-500 ${buttonFocus}`}>Cancelar</button>
        </form>}
      </section>

      {editor && station ? <div key={editor.printer?.id || 'new'}><PrinterEditor printer={editor.printer} pending={model.save.isPending}
        error={model.save.error instanceof Error ? model.save.error.message : null}
        onClose={() => { if (!model.save.isPending) setEditor(null); }} onSave={(draft, id) => void save(draft, id)} onPreview={previewPdvReceiptTemplate} /></div>
        : !station ? <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center"><Laptop size={30} className="mx-auto text-slate-300" aria-hidden="true" /><h3 className="mt-4 font-bold">Selecione sua estação</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{stations.length ? 'Escolha uma estação acima para consultar suas impressoras.' : 'Registre este ponto de atendimento para definir a impressora e o comportamento do PDV.'}</p></div>
        : !printers.length ? <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center"><Printer size={30} className="mx-auto text-slate-300" aria-hidden="true" /><h3 className="mt-4 font-bold">Nenhuma impressora cadastrada</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">O PDV pode perguntar sobre a impressão e abrir o diálogo do navegador. Cadastre uma impressora para definir o modelo e a preferência desta estação.</p></div>
        : <div className="grid gap-4 md:grid-cols-2">{printers.map(printer => <article key={printer.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800"><Printer size={22} aria-hidden="true" /></span><div className="flex flex-wrap justify-end gap-1.5">{printer.isDefault && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-800">Padrão</span>}<span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${printer.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{printer.active ? 'Ativa' : 'Inativa'}</span></div></div>
          <h3 className="mt-4 break-words text-lg font-bold">{printer.name}</h3><p className="mt-1 text-xs text-slate-500">{printer.model || 'Modelo não informado'} · {printer.template.widthMm} mm</p>
          <dl className="mt-4 space-y-2 border-y border-slate-100 py-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-500">Conexão</dt><dd className="text-right font-semibold">{transportLabels[printer.transport]}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Após o pagamento</dt><dd className="text-right font-semibold">{behaviorLabels[printer.behavior]}</dd></div></dl>
          <p className={`mt-4 flex items-start gap-2 text-xs leading-5 ${printer.transportReady ? 'text-slate-600' : 'text-amber-800'}`}>{printer.transportReady ? <Check size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />}{printer.readinessReason || (printer.transport === 'BROWSER' ? 'Disponível pelo diálogo do navegador.' : 'Transporte ainda não homologado nesta estação.')}</p>
          {data.canManage && <button type="button" onClick={() => { model.save.reset(); setEditor({ printer }); }} className={`mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold hover:bg-blue-50 ${buttonFocus}`}><Pencil size={16} aria-hidden="true" />Editar impressora e modelo</button>}
        </article>)}</div>}
    </div>
  );
}

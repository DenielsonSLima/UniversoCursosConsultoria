import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import ToastNotification, { useToast } from '../../shared/ToastNotification';
import { loadExistingBoletoPdf } from './parceiro-aluno-financeiro.service';
import { openEadBoletoTab, type PendingBoletoTab } from './ead-boleto-tab';

export default function EadBoletoButton({ receivableId }: { receivableId: string }) {
  const [opening, setOpening] = useState(false);
  const pending = useRef<PendingBoletoTab | null>(null);
  const { toasts, removeToast, toast } = useToast();
  useEffect(() => () => {
    pending.current?.cancel();
    pending.current = null;
  }, [receivableId]);

  const open = () => {
    if (pending.current) return;
    let task: PendingBoletoTab;
    try { task = openEadBoletoTab(signal => loadExistingBoletoPdf(receivableId, signal)); }
    catch (error) {
      toast.error('Boleto indisponível', error instanceof Error ? error.message : 'Não foi possível abrir o boleto.');
      return;
    }
    pending.current = task;
    setOpening(true);
    void task.result.catch((error: unknown) => {
      if (pending.current === task) toast.error('Boleto indisponível', error instanceof Error ? error.message : 'Tente novamente.');
    }).finally(() => {
      if (pending.current === task) { pending.current = null; setOpening(false); }
    });
  };
  return <>
    <button type="button" onClick={open} disabled={opening} aria-label="Abrir boleto em nova aba"
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-[#001a33] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60">
      {opening ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
      {opening ? 'Abrindo…' : 'Abrir'}
    </button>
    <ToastNotification toasts={toasts} onRemove={removeToast} />
  </>;
}

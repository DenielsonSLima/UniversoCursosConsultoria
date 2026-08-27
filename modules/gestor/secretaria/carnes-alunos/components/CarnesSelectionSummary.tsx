import { FileCheck2, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { formatBaneseCurrency } from '../carnes-alunos.format';
import {
  MAX_BOLETO_REQUESTS,
  MAX_CARNET_REQUESTS,
  MAX_ESTIMATED_DOCUMENT_PAGES,
} from '../carnes-alunos.selection';
import type { CarnesAlunosController } from '../hooks/useCarnesAlunosController';

interface CarnesSelectionSummaryProps {
  controller: CarnesAlunosController;
}

const CarnesSelectionSummary = ({ controller }: CarnesSelectionSummaryProps) => {
  const totalAmount = controller.selectedGroups.reduce(
    (total, group) => total + group.totalAmount,
    0,
  );
  const progressLabel = controller.progress.total
    ? `${controller.progress.current} de ${controller.progress.total}`
    : null;

  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Resumo da seleção">
      <header className="flex flex-col gap-3 bg-[#001a33] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Seleção atual</p>
          <p className="mt-1 text-sm font-bold">
            {controller.selectedGroups.length} matrícula(s) · {formatBaneseCurrency(totalAmount)}
          </p>
        </div>
        {controller.selectedGroups.length > 0 ? (
          <button
            type="button"
            disabled={controller.generating}
            onClick={controller.clearSelection}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider transition hover:bg-white/20 disabled:opacity-50 sm:self-auto"
          >
            <Trash2 size={14} /> Limpar
          </button>
        ) : null}
      </header>

      <div className="space-y-4 p-5">
        {controller.selectedGroups.length ? (
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
            {controller.selectedGroups.map((group) => (
              <div key={group.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black uppercase text-[#001a33]">{group.studentName}</p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">
                    {group.enrollmentCode} · {group.courseName}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={controller.generating}
                  onClick={() => controller.toggleGroup(group)}
                  aria-label={`Remover ${group.studentName} da seleção`}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
            <FileCheck2 className="mx-auto text-slate-300" size={25} />
            <p className="mt-2 text-xs font-bold text-slate-500">Selecione uma ou mais matrículas acima.</p>
          </div>
        )}

        <div className="grid gap-2 text-[10px] font-bold sm:grid-cols-3">
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
            Carnês: {controller.requestCounts.carnetRequests}/{MAX_CARNET_REQUESTS} requisições
          </p>
          <p className="rounded-xl bg-cyan-50 px-3 py-2 text-cyan-800">
            Boletos: {controller.requestCounts.boletoRequests}/{MAX_BOLETO_REQUESTS} requisições
          </p>
          <p className="rounded-xl bg-indigo-50 px-3 py-2 text-indigo-800">
            Páginas estimadas: {controller.requestCounts.estimatedPages}/{MAX_ESTIMATED_DOCUMENT_PAGES}
          </p>
        </div>

        <p className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[10px] font-semibold leading-relaxed text-emerald-900">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          Somente títulos Banese existentes serão lidos. Esta ação não cria, reemite, altera ou sincroniza cobranças.
        </p>

        <button
          type="button"
          disabled={!controller.selectedGroups.length || controller.generating}
          onClick={() => { void controller.prepareSelectedDocument(); }}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-900/10 transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {controller.generating ? <Loader2 className="animate-spin" size={17} /> : <FileCheck2 size={17} />}
          {controller.generating ? `Preparando ${progressLabel || ''}` : 'Preparar prévia em PDF'}
        </button>
      </div>
    </aside>
  );
};

export default CarnesSelectionSummary;

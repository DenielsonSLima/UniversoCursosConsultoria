import React, { useState } from 'react';
import { ArrowRight, FileDown, ShieldCheck } from 'lucide-react';
import { formatCaixaCompetencia } from '../caixa.formatters';
import { CaixaReportPreviewModal } from './CaixaReportPreviewModal';

interface CaixaReportLauncherProps {
  poloId: string | null | undefined;
  competencia: string;
  scopeLabel: string;
}

export const CaixaReportLauncher: React.FC<CaixaReportLauncherProps> = ({
  poloId,
  competencia,
  scopeLabel,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-white via-blue-50/60 to-indigo-50 shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-200">
              <FileDown size={20} />
            </span>
            <div>
              <h2 className="text-base font-bold text-[#001a33]">Prestação detalhada em PDF</h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                Prévia com cabeçalho, marca d’água, resumo executivo, todos os recebimentos
                e todas as despesas de {formatCaixaCompetencia(competencia)}.
              </p>
              <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold text-blue-700">
                <ShieldCheck size={12} />
                {scopeLabel} · dados conferidos no backend · uso interno
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-950"
          >
            Pré-visualizar PDF
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <CaixaReportPreviewModal
        open={open}
        onClose={() => setOpen(false)}
        poloId={poloId}
        competencia={competencia}
      />
    </>
  );
};


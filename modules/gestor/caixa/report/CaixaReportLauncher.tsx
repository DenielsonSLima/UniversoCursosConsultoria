import React, { useState } from 'react';
import { FileDown } from 'lucide-react';
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
      <div className="group relative">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-describedby="caixa-pdf-tooltip"
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-black uppercase tracking-wider text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <FileDown size={17} />
          PDF
        </button>
        <div
          id="caixa-pdf-tooltip"
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-72 rounded-xl bg-slate-950 px-3.5 py-3 text-left shadow-xl group-hover:block group-focus-within:block"
        >
          <p className="text-xs font-bold text-white">Pré-visualizar prestação detalhada</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-300">
            Cabeçalho, marca d’água, resumo e movimentos de{' '}
            {formatCaixaCompetencia(competencia)}.
          </p>
          <p className="mt-1 text-[9px] font-semibold text-blue-300">
            {scopeLabel} · conferido automaticamente
          </p>
        </div>
      </div>

      <CaixaReportPreviewModal
        open={open}
        onClose={() => setOpen(false)}
        poloId={poloId}
        competencia={competencia}
      />
    </>
  );
};

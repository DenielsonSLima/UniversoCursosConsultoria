import React from 'react';
import { ShieldCheck } from 'lucide-react';
import type { CicloFinanceiroTecnicoManualPreview } from './matricula-tecnica-ciclo-manual.types';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');

export default function FinanceiroCicloManualDatesSummary({
  preview,
}: { preview: CicloFinanceiroTecnicoManualPreview }) {
  const firstMonthly = preview.itens.find((item) => item.tipo === 'PARCELA' && item.numero === 1);
  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-900" aria-label="Datas calculadas do ciclo">
      <p className="flex items-center gap-2 text-xs font-bold"><ShieldCheck size={18} /> Composição calculada</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-[10px] font-bold uppercase">Data inicial do ciclo</dt><dd className="mt-1 text-lg font-black"><time dateTime={preview.primeiroVencimento}>{formatDate(preview.primeiroVencimento)}</time></dd></div>
        {firstMonthly ? <div><dt className="text-[10px] font-bold uppercase">Primeira mensalidade</dt><dd className="mt-1 text-lg font-black"><time dateTime={firstMonthly.vencimento}>{formatDate(firstMonthly.vencimento)}</time></dd></div> : null}
      </dl>
      <p className="mt-3 text-xs font-semibold">Avance para conferir e ajustar o vencimento de cada cobrança.</p>
    </div>
  );
}

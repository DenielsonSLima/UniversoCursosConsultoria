import React from 'react';
import { formatCaixaCurrency } from '../caixa.formatters';
import type { CaixaDetailedReport } from './caixa-report.types';

const FEATURED_MODALITIES = [
  'EAD',
  'ESPECIALIZACAO',
  'TECNICO',
  'LIVRE',
] as const;

const SummaryPanel: React.FC<{
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}> = ({ eyebrow, title, children }) => (
  <section className="rounded-xl border border-slate-200 bg-white p-3">
    <header className="border-b border-slate-100 pb-2">
      <p className="text-[7px] font-black uppercase tracking-[0.18em] text-blue-600">
        {eyebrow}
      </p>
      <h3 className="mt-0.5 text-[11px] font-black uppercase tracking-tight text-[#001a33]">
        {title}
      </h3>
    </header>
    {children}
  </section>
);

export const CaixaReportSummaryBreakdowns: React.FC<{
  report: CaixaDetailedReport;
}> = ({ report }) => {
  const modalities = FEATURED_MODALITIES.map((code) => (
    report.resumo.receitasPorModalidade.find((item) => item.codigo === code)!
  ));

  return (
    <div className="grid grid-cols-2 gap-3">
      <SummaryPanel eyebrow="Origem das entradas" title="Receitas recebidas por modalidade">
        <div className="divide-y divide-slate-100">
          {modalities.map((item) => (
            <div key={item.codigo} className="grid grid-cols-[1fr_auto] items-center gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[9px] font-black text-slate-800">{item.rotulo}</p>
                <p className="mt-0.5 text-[7px] text-slate-400">
                  {item.quantidade} recebimento(s) confirmado(s)
                </p>
              </div>
              <strong className="text-[10px] text-emerald-700">
                {formatCaixaCurrency(item.valor)}
              </strong>
            </div>
          ))}
        </div>
      </SummaryPanel>

      <SummaryPanel eyebrow="Acompanhamento mensal" title="Resumo financeiro por turma">
        {report.resumoTurmas.itens.length === 0 ? (
          <div className="flex min-h-[100px] items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-[8px] font-semibold text-slate-400">
            Nenhuma parcela prevista, recebida ou vencida por turma nesta competência.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_repeat(3,72px)] gap-1 border-b border-slate-100 py-1.5 text-right text-[6px] font-black uppercase tracking-wider text-slate-400">
              <span className="text-left">Turma</span>
              <span>Previsto</span>
              <span>Recebido</span>
              <span>Em atraso</span>
            </div>
            <div className="divide-y divide-slate-100">
              {report.resumoTurmas.itens.map((item) => (
                <div
                  key={item.turmaId || `${
                    item.agregado ? 'agregado' : 'sem-turma'
                  }-${item.turma}`}
                  className="grid grid-cols-[1fr_repeat(3,72px)] items-center gap-1 py-1.5 text-right"
                >
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[8px] font-black text-slate-800">{item.turma}</p>
                    <p className="mt-0.5 truncate text-[6px] text-slate-400">
                      {item.agregado
                        ? `${item.quantidadeTurmas} turmas consolidadas`
                        : `${item.curso} · ${item.modalidade}`}
                    </p>
                  </div>
                  <strong className="text-[8px] text-slate-700">
                    {formatCaixaCurrency(item.previstoNoMes)}
                  </strong>
                  <strong className="text-[8px] text-emerald-700">
                    {formatCaixaCurrency(item.recebidoNoMes)}
                  </strong>
                  <strong className={`text-[8px] ${
                    item.emAtraso > 0 ? 'text-amber-700' : 'text-slate-400'
                  }`}>
                    {formatCaixaCurrency(item.emAtraso)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </SummaryPanel>
    </div>
  );
};

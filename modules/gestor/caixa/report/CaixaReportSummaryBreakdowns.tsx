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
  <section className="rounded-xl border border-slate-200 bg-white p-2.5">
    <header className="border-b border-slate-100 pb-1.5">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-blue-600">
        {eyebrow}
      </p>
      <h3 className="mt-0.5 text-[10px] font-black uppercase tracking-tight text-[#001a33]">
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
    <div className="grid grid-cols-2 gap-2">
      <SummaryPanel eyebrow="Origem das entradas" title="Receitas recebidas por modalidade">
        <div className="divide-y divide-slate-100">
          {modalities.map((item) => (
            <div key={item.codigo} className="grid grid-cols-[1fr_auto] items-center gap-3 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-[9px] font-black text-slate-800">{item.rotulo}</p>
                <p className="mt-0.5 text-[8px] text-slate-500">
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

      <SummaryPanel eyebrow="Acompanhamento mensal" title="Resumo financeiro por curso">
        {report.resumoCursos.itens.length === 0 ? (
          <div className="flex min-h-[72px] items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-[8px] font-semibold text-slate-500">
            Nenhum curso parcelado possui previsão, recebimento ou atraso nesta competência.
          </div>
        ) : (
          <div>
            <div className="grid grid-cols-[1fr_repeat(3,72px)] gap-1 border-b border-slate-100 py-1.5 text-right text-[7.5px] font-black uppercase tracking-wide text-slate-500">
              <span className="text-left">Curso</span>
              <span>Previsto</span>
              <span>Recebido</span>
              <span>Em atraso</span>
            </div>
            <div className="divide-y divide-slate-100">
              {report.resumoCursos.itens.map((item) => (
                <div
                  key={item.cursoId}
                  className="grid grid-cols-[1fr_repeat(3,72px)] items-center gap-1 py-1.5 text-right"
                >
                  <div className="min-w-0 text-left">
                    <p className="truncate text-[8px] font-black text-slate-800">{item.curso}</p>
                    <p className="mt-0.5 truncate text-[8px] text-slate-500">
                      {item.modalidade} · {item.quantidadeTurmas} turma(s) ·{' '}
                      {item.quantidadeAlunos} aluno(s)
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
            {report.resumoCursos.quantidadeOmitidas > 0 && (
              <p className="border-t border-slate-100 pt-1.5 text-right text-[8px] font-bold text-slate-500">
                + {report.resumoCursos.quantidadeOmitidas} curso(s) na análise recorrente
              </p>
            )}
          </div>
        )}
      </SummaryPanel>
    </div>
  );
};

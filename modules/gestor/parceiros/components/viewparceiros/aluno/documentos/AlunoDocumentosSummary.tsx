import React from 'react';
import { CheckCircle2, CircleDashed, Clock3, FileStack, XCircle } from 'lucide-react';
import { DocumentoAlunoChecklistItem } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import { resumirDocumentosAluno } from '../../../../../../shared/documentos-aluno/documentos-aluno.utils';

interface AlunoDocumentosSummaryProps {
  itens: DocumentoAlunoChecklistItem[];
}

const AlunoDocumentosSummary: React.FC<AlunoDocumentosSummaryProps> = ({ itens }) => {
  const resumo = resumirDocumentosAluno(itens);
  const analisados = resumo.aprovados + resumo.recusados;
  const progresso = resumo.total > 0 ? Math.round((analisados / resumo.total) * 100) : 0;

  const cards = [
    { label: 'Total', value: resumo.total, icon: FileStack, tone: 'text-[#001a33] bg-slate-100' },
    { label: 'Não enviados', value: resumo.naoEnviados, icon: CircleDashed, tone: 'text-slate-600 bg-slate-100' },
    { label: 'Em análise', value: resumo.pendentes, icon: Clock3, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Aprovados', value: resumo.aprovados, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Recusados', value: resumo.recusados, icon: XCircle, tone: 'text-red-700 bg-red-50' },
  ];

  return (
    <section aria-labelledby="documentos-resumo-title" className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-5 bg-[#001a33] px-5 py-5 text-white sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-blue-300">Conferência documental</p>
          <h3 id="documentos-resumo-title" className="mt-1 text-lg font-black tracking-tight">
            Visão geral do checklist
          </h3>
          <p className="mt-1 text-xs font-medium text-slate-300">
            {analisados} de {resumo.total} itens já receberam decisão.
          </p>
        </div>
        <div className="min-w-48">
          <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-slate-300">
            <span>Progresso</span>
            <span>{progresso}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso da análise documental"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progresso}
            className="h-2 overflow-hidden rounded-full bg-white/15"
          >
            <div className="h-full rounded-full bg-blue-400 transition-[width]" style={{ width: `${progresso}%` }} />
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-slate-200 sm:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="flex items-center gap-3 bg-white px-4 py-4">
            <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon aria-hidden="true" size={16} />
            </span>
            <div>
              <dt className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</dt>
              <dd className="mt-0.5 text-lg font-black leading-none text-[#001a33]">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default AlunoDocumentosSummary;

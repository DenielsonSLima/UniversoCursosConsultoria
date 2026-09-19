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
    <section aria-labelledby="documentos-resumo-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 px-4 py-4 text-[#001a33] sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-blue-700">Conferência documental</p>
          <h3 id="documentos-resumo-title" className="mt-1 text-lg font-semibold tracking-tight">
            Visão geral do checklist
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            {analisados} de {resumo.total} itens já receberam decisão.
          </p>
        </div>
        <div className="min-w-48">
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Progresso</span>
            <span>{progresso}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso da análise documental"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progresso}
            className="h-1.5 overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${progresso}%` }} />
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
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold leading-none text-[#001a33]">{value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default AlunoDocumentosSummary;

import React from 'react';
import { Printer, ScrollText, X } from 'lucide-react';
import type { SecretariaAcademicResult } from './academic-results.service';

interface AcademicResultsModalProps {
  open: boolean;
  onClose: () => void;
  results: SecretariaAcademicResult[];
  courseName?: string | null;
  classCode?: string | null;
  poloName?: string | null;
  onPrint?: () => void;
}

const RESULT_LABELS: Record<string, string> = {
  APROVADO: 'Aprovado',
  APROVEITADO: 'Aproveitado',
  EM_RECUPERACAO: 'Em recuperação',
  REPROVADO: 'Reprovado',
  REPROVADO_FREQUENCIA: 'Reprovado por frequência',
  FREQUENCIA_PENDENTE: 'Frequência pendente',
  SEM_LANCAMENTO: 'Sem lançamento',
};

const formatNumber = (value: number | null, fractionDigits = 1) =>
  value === null ? '—' : value.toFixed(fractionDigits);

const resultClass = (result: string) => {
  if (result === 'APROVADO' || result === 'APROVEITADO') {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (result === 'EM_RECUPERACAO' || result === 'FREQUENCIA_PENDENTE' || result === 'SEM_LANCAMENTO') {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-rose-100 text-rose-800';
};

const AcademicResultsModal: React.FC<AcademicResultsModalProps> = ({
  open,
  onClose,
  results,
  courseName,
  classCode,
  poloName,
  onPrint,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-slideUp">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <ScrollText className="text-blue-600" size={20} />
            <h4 className="text-base font-black uppercase tracking-tight text-[#001a33]">Boletim Informativo de Notas</h4>
          </div>
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm transition-colors hover:text-rose-500">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-6 custom-scrollbar">
          <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-150 bg-slate-50 p-4 sm:grid-cols-3">
            {[['Curso', courseName || 'CURSO GERAL'], ['Turma', classCode || 'N/A'], ['Polo Vinculado', poloName || 'Matriz']].map(([label, value]) => (
              <div key={label}>
                <span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
                <span className="text-xs font-black uppercase text-slate-800">{value}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full border-collapse text-left text-xs">
              <thead><tr className="border-b border-slate-200 text-[9px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-2.5">Disciplina</th>
                {['P', 'TI', 'TG', 'S', 'CQ', 'O', 'REC', 'Média', 'Frequência', 'Resultado'].map((label) => <th key={label} className="py-2.5 text-center">{label}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {!results.length ? <tr><td colSpan={11} className="py-12 text-center font-medium text-slate-400">Nenhum resultado acadêmico autoritativo disponível para esta turma.</td></tr> : results.map((result) => (
                  <tr key={result.id} className="hover:bg-slate-50/50">
                    <td className="py-3.5 text-slate-900">{result.disciplinaNome}</td>
                    {[result.notaP, result.notaTi, result.notaTg, result.notaS, result.notaCq, result.notaO, result.notaRec, result.mediaFinal].map((value, index) => <td key={index} className="py-3.5 text-center font-mono">{formatNumber(value)}</td>)}
                    <td className="py-3.5 text-center font-mono">{result.frequenciaPercent === null ? '—' : `${formatNumber(result.frequenciaPercent, 0)}%`}</td>
                    <td className="py-3.5 text-center"><span className={`rounded px-2 py-0.5 text-[9px] font-black uppercase ${resultClass(result.resultadoFinal)}`}>{RESULT_LABELS[result.resultadoFinal] || result.resultadoFinal.replaceAll('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {onPrint ? <div className="flex justify-end border-t border-slate-200 bg-slate-50 p-4 print:hidden"><button onClick={onPrint} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg hover:bg-blue-900"><Printer size={14} /> Imprimir Boletim</button></div> : null}
      </div>
    </div>
  );
};

export default AcademicResultsModal;

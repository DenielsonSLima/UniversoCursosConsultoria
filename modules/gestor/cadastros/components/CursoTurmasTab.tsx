import React from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { getModalidadeConfig } from './cursoGradeCurricular.helpers';

interface CursoTurmasTabProps {
  turmas: any[];
  loading: boolean;
  config: ReturnType<typeof getModalidadeConfig>;
}

const CursoTurmasTab: React.FC<CursoTurmasTabProps> = ({ turmas, loading, config }) => {
  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 flex-1">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  if (turmas.length === 0) {
    return (
      <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
        <Layers className="text-slate-300 mx-auto mb-4" size={48} />
        <p className="text-slate-500 font-bold">Nenhuma turma vinculada a este curso.</p>
        <p className="text-xs text-slate-400 mt-1">Este curso pode ser excluído com segurança.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
      {turmas.map((turma, index) => (
        <div key={turma.id} className={`${index % 2 === 0 ? 'bg-white' : config.bgColor} p-5 transition-colors flex flex-col gap-3`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                {turma.codigo}
              </span>
              <span className="font-black text-slate-800 text-sm">{turma.nome}</span>
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${turma.status === 'EM_ANDAMENTO' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
              {turma.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Finalizada'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100/50 text-xs text-slate-500 font-medium">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1">
                <span className="font-bold text-slate-400">Polo:</span>{' '}
                <span className="text-slate-700 font-bold">{turma.polos?.nome || 'Matriz'}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <span className="font-bold text-slate-400">Turno:</span>{' '}
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">{turma.turno}</span>
              </span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <span className="font-bold text-slate-400">Período:</span>{' '}
                <span className="text-slate-600 font-bold">
                  {turma.data_inicio ? new Date(turma.data_inicio).toLocaleDateString('pt-BR') : '-'} até{' '}
                  {turma.data_previsao_termino ? new Date(turma.data_previsao_termino).toLocaleDateString('pt-BR') : '-'}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-xl border border-slate-100 w-fit">
              <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Vagas:</span>
              <span className="text-sm font-black text-slate-700">{turma.vagas_totais}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CursoTurmasTab;

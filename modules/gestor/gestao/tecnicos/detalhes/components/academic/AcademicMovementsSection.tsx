import React from 'react';
import { CalendarDays, Clock3, FileText, History, Loader2 } from 'lucide-react';
import { AcademicMovement } from '../../academic-lifecycle.service';
import TechnicalDataError from '../TechnicalDataError';

interface AcademicMovementsSectionProps {
  movements: AcademicMovement[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

const AcademicMovementsSection: React.FC<AcademicMovementsSectionProps> = ({
  movements,
  isLoading,
  isError,
  isFetching,
  onRetry,
}) => (
  <section>
    <div className="mb-4 flex items-center gap-2">
      <History size={17} className="text-violet-600" />
      <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Histórico de movimentações</h4>
    </div>
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      {isLoading ? (
        <div className="flex justify-center py-14"><Loader2 className="animate-spin text-violet-600" /></div>
      ) : isError ? (
        <div className="p-4">
          <TechnicalDataError
            title="Histórico não carregado"
            message="Não foi possível confirmar as movimentações acadêmicas desta turma."
            retrying={isFetching}
            onRetry={onRetry}
          />
        </div>
      ) : movements.length === 0 ? (
        <p className="py-14 text-center text-sm text-slate-400">Nenhuma movimentação registrada.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {movements.map((movement) => (
            <div key={movement.id} className="flex flex-col justify-between gap-3 p-4 md:flex-row md:items-center">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-violet-50 p-2 text-violet-600"><Clock3 size={15} /></div>
                <div>
                  <p className="text-sm font-black text-[#001a33]">{movement.aluno?.nome || 'Aluno'}</p>
                  <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-violet-600">
                    {movement.tipo.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{movement.motivo}</p>
                  {movement.observacao && (
                    <p className="mt-2 flex items-start gap-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-600">
                      <FileText size={12} className="mt-0.5 shrink-0 text-slate-400" />
                      {movement.observacao}
                    </p>
                  )}
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="flex items-center gap-1 text-[10px] font-black text-blue-700 md:justify-end">
                  <CalendarDays size={12} />
                  {new Date(`${movement.data_movimentacao}T12:00:00`).toLocaleDateString('pt-BR')}
                </p>
                <p className="mt-1 text-[9px] text-slate-400">{movement.status_anterior || 'INÍCIO'} → {movement.status_novo}</p>
                <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-400 md:justify-end">
                  <Clock3 size={10} /> Registrado em {new Date(movement.created_at).toLocaleString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </section>
);

export default AcademicMovementsSection;

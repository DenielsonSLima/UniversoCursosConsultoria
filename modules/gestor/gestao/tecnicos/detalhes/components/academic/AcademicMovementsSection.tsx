import React from 'react';
import { Clock3, History, Loader2 } from 'lucide-react';
import TechnicalDataError from '../TechnicalDataError';

interface AcademicMovementsSectionProps {
  movements: any[];
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
                </div>
              </div>
              <div className="text-left md:text-right">
                <p className="text-[10px] font-bold text-slate-500">{new Date(movement.created_at).toLocaleString('pt-BR')}</p>
                <p className="mt-1 text-[9px] text-slate-400">{movement.status_anterior || 'INÍCIO'} → {movement.status_novo}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </section>
);

export default AcademicMovementsSection;

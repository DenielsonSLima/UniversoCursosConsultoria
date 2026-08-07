import React from 'react';
import { CalendarDays, Clock3, FileText, History, X } from 'lucide-react';
import { AcademicMovement, AcademicStudent } from '../../academic-lifecycle.service';

interface MovimentacaoHistoricoModalProps {
  student: AcademicStudent;
  movements: AcademicMovement[];
  onClose: () => void;
}

const formatAcademicDate = (value?: string | null) => value
  ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR')
  : 'Não informada';

const formatRegisteredAt = (value: string) => new Date(value).toLocaleString('pt-BR');

const MovimentacaoHistoricoModal: React.FC<MovimentacaoHistoricoModalProps> = ({
  student,
  movements,
  onClose,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
    <div className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
      <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">
            <History size={14} /> Histórico da matrícula
          </p>
          <h3 className="mt-1 text-xl font-black">{student.nome}</h3>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-blue-200 hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      <div className="max-h-[calc(88vh-104px)] overflow-y-auto p-6">
        {movements.length === 0 ? (
          <p className="py-12 text-center text-sm font-semibold text-slate-400">
            Nenhuma movimentação registrada para esta matrícula.
          </p>
        ) : (
          <div className="space-y-4">
            {movements.map((movement) => (
              <article key={movement.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-600">
                      {movement.tipo.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">
                      {movement.status_anterior || 'INÍCIO'} → {movement.status_novo}
                    </p>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-800">
                    <p className="flex items-center gap-1.5 text-[10px] font-black uppercase">
                      <CalendarDays size={13} /> Data acadêmica
                    </p>
                    <p className="mt-0.5 text-sm font-black">{formatAcademicDate(movement.data_movimentacao)}</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3 text-xs text-slate-600">
                  <div>
                    <p className="font-black uppercase tracking-wide text-slate-400">Motivo</p>
                    <p className="mt-1 whitespace-pre-wrap font-semibold">{movement.motivo}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="flex items-center gap-1.5 font-black uppercase tracking-wide text-slate-400">
                      <FileText size={12} /> Observação
                    </p>
                    <p className="mt-1 whitespace-pre-wrap font-semibold text-slate-600">
                      {movement.observacao || 'Nenhuma observação adicional.'}
                    </p>
                  </div>
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                    <Clock3 size={12} /> Registrado no sistema em {formatRegisteredAt(movement.created_at)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

export default MovimentacaoHistoricoModal;

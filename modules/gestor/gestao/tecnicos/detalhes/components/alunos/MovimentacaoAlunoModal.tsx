import React from 'react';
import {
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Loader2,
  PauseCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { AcademicMovementType, AcademicStudent } from '../../academic-lifecycle.service';

export type OperationMode = 'MOVIMENTACAO' | 'TRANSFERENCIA';
export type TransferType = 'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA';

const movementLabels: Record<AcademicMovementType, string> = {
  TRANCAMENTO: 'Trancar matrícula',
  CANCELAMENTO: 'Cancelar matrícula',
  DESISTENCIA: 'Registrar desistência',
  REATIVACAO: 'Reativar matrícula',
  CONCLUSAO: 'Concluir matrícula',
};

interface MovimentacaoAlunoModalProps {
  student: AcademicStudent;
  operationMode: OperationMode;
  movementType: AcademicMovementType;
  transferType: TransferType;
  reason: string;
  notes: string;
  returnDate: string;
  destinationClassId: string;
  destinationInstitution: string;
  destinationClasses: any[];
  movementPending: boolean;
  transferPending: boolean;
  onOperationModeChange: (mode: OperationMode) => void;
  onMovementTypeChange: (type: AcademicMovementType) => void;
  onTransferTypeChange: (type: TransferType) => void;
  onReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onReturnDateChange: (value: string) => void;
  onDestinationClassChange: (value: string) => void;
  onDestinationInstitutionChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const MovimentacaoAlunoModal: React.FC<MovimentacaoAlunoModalProps> = ({
  student,
  operationMode,
  movementType,
  transferType,
  reason,
  notes,
  returnDate,
  destinationClassId,
  destinationInstitution,
  destinationClasses,
  movementPending,
  transferPending,
  onOperationModeChange,
  onMovementTypeChange,
  onTransferTypeChange,
  onReasonChange,
  onNotesChange,
  onReturnDateChange,
  onDestinationClassChange,
  onDestinationInstitutionChange,
  onClose,
  onConfirm,
}) => {
  const disabled = !reason.trim()
    || movementPending
    || transferPending
    || (operationMode === 'TRANSFERENCIA'
      && transferType !== 'EXTERNA_ENVIADA'
      && !destinationClassId)
    || (operationMode === 'TRANSFERENCIA'
      && transferType === 'EXTERNA_ENVIADA'
      && !destinationInstitution.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden">
        <div className="p-6 bg-[#001a33] text-white flex justify-between items-start">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Movimentação acadêmica</p>
            <h3 className="font-black text-xl mt-1">{student.nome}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-blue-200 hover:bg-white/10 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              onClick={() => onOperationModeChange('MOVIMENTACAO')}
              className={`py-2.5 rounded-lg text-xs font-black uppercase ${operationMode === 'MOVIMENTACAO' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500'}`}
            >
              Situação
            </button>
            <button
              onClick={() => onOperationModeChange('TRANSFERENCIA')}
              disabled={student.status !== 'ATIVO'}
              className={`py-2.5 rounded-lg text-xs font-black uppercase disabled:opacity-40 ${operationMode === 'TRANSFERENCIA' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}
            >
              Transferência
            </button>
          </div>

          {operationMode === 'MOVIMENTACAO' ? (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Operação</label>
              <select
                value={movementType}
                onChange={(event) => onMovementTypeChange(event.target.value as AcademicMovementType)}
                className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-slate-700"
              >
                {['TRANCADO', 'DESISTENTE', 'CANCELADO'].includes(student.status) ? (
                  <option value="REATIVACAO">{movementLabels.REATIVACAO}</option>
                ) : (
                  <>
                    <option value="TRANCAMENTO">{movementLabels.TRANCAMENTO}</option>
                    <option value="CANCELAMENTO">{movementLabels.CANCELAMENTO}</option>
                    <option value="DESISTENCIA">{movementLabels.DESISTENCIA}</option>
                    <option value="CONCLUSAO">{movementLabels.CONCLUSAO}</option>
                  </>
                )}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Tipo de transferência</label>
                <select
                  value={transferType}
                  onChange={(event) => onTransferTypeChange(event.target.value as TransferType)}
                  className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500 font-bold text-slate-700"
                >
                  <option value="INTERNA_TURMA">Entre turmas</option>
                  <option value="INTERNA_POLO">Entre polos</option>
                  <option value="EXTERNA_ENVIADA">Para outra instituição</option>
                </select>
              </div>
              {transferType === 'EXTERNA_ENVIADA' ? (
                <input
                  value={destinationInstitution}
                  onChange={(event) => onDestinationInstitutionChange(event.target.value)}
                  placeholder="Instituição de destino"
                  className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
                />
              ) : (
                <select
                  value={destinationClassId}
                  onChange={(event) => onDestinationClassChange(event.target.value)}
                  className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-violet-500"
                >
                  <option value="">Selecione a turma de destino...</option>
                  {destinationClasses.map((destination: any) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.nome} - {destination.polos?.nome || 'Polo não informado'}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Motivo obrigatório</label>
            <input
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Descreva o motivo da operação"
              className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
            />
          </div>

          {operationMode === 'MOVIMENTACAO' && movementType === 'TRANCAMENTO' && (
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Retorno previsto</label>
              <input
                type="date"
                value={returnDate}
                onChange={(event) => onReturnDateChange(event.target.value)}
                className="w-full p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              />
            </div>
          )}

          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Observações adicionais (opcional)"
            className="w-full min-h-24 p-3.5 border border-slate-200 rounded-xl outline-none focus:border-blue-500 resize-none"
          />

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-black uppercase text-xs">
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={disabled}
              className="flex-[1.5] py-3 rounded-xl bg-[#001a33] text-white font-black uppercase text-xs disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {(movementPending || transferPending)
                ? <Loader2 size={15} className="animate-spin" />
                : operationMode === 'TRANSFERENCIA'
                  ? <ArrowRightLeft size={15} />
                  : movementType === 'REATIVACAO'
                    ? <RotateCcw size={15} />
                    : movementType === 'CONCLUSAO'
                      ? <CheckCircle2 size={15} />
                      : movementType === 'DESISTENCIA'
                        ? <Ban size={15} />
                        : <PauseCircle size={15} />}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovimentacaoAlunoModal;

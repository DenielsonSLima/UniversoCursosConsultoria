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
import { AcademicMovementType } from '../../../../gestao/tecnicos/detalhes/academic-lifecycle.service';
import type { GatewayPaymentMethod } from '../../../../../asaas/asaas.service';

export type OperationMode = 'MOVIMENTACAO' | 'TRANSFERENCIA';
export type TransferType = 'INTERNA_TURMA' | 'INTERNA_POLO' | 'EXTERNA_ENVIADA';

const movementLabels: Record<AcademicMovementType, string> = {
  TRANCAMENTO: 'Trancar matrícula',
  CANCELAMENTO: 'Cancelar matrícula',
  DESISTENCIA: 'Registrar desistência',
  REATIVACAO: 'Reativar na mesma turma',
  CONCLUSAO: 'Concluir matrícula',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

interface EnrollmentModalProps {
  open: boolean;
  classId: string;
  classes: any[];
  pendingClass: any;
  paymentMethod: GatewayPaymentMethod | null;
  availablePaymentMethods: GatewayPaymentMethod[];
  paymentOptionsLoading: boolean;
  paymentOptionsError: string | null;
  mutation: any;
  onClassChange: (value: string) => void;
  onPaymentMethodChange: (value: GatewayPaymentMethod) => void;
  onPrepare: () => void;
  onConfirm: () => void;
  onCloseEnrollment: () => void;
  onCloseConfirmation: () => void;
}

const EnrollmentModals: React.FC<EnrollmentModalProps> = ({
  open, classId, classes, pendingClass, mutation, onClassChange, onPrepare,
  paymentMethod, availablePaymentMethods, paymentOptionsLoading,
  paymentOptionsError, onPaymentMethodChange, onConfirm, onCloseEnrollment,
  onCloseConfirmation,
}) => {
  const origemFinanceira = pendingClass?.origem_financeira || 'NORMAL';
  const financeiroHerdado = Boolean(pendingClass?.financeiro_herdado)
    || origemFinanceira === 'LEGADO';
  const requiresPaymentMethod = pendingClass?.cursos?.modalidade === 'TECNICO'
    && !financeiroHerdado;
  const requiresGatewayValidation = requiresPaymentMethod
    && (pendingClass?.sincronizar_asaas_futuro ?? true);
  const allPaymentMethods = [
    ['PIX', 'Pix'],
    ['BOLETO', 'Boleto'],
    ['CREDIT_CARD', 'Cartão'],
  ] as const;
  const visiblePaymentMethods = requiresGatewayValidation
    ? allPaymentMethods.filter(([value]) => availablePaymentMethods.includes(value))
    : allPaymentMethods;

  return (
  <>
    {open && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-xl rounded-[2rem] bg-white p-7 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black uppercase text-[#001a33]">Nova matrícula</h4>
              <p className="text-xs text-slate-500">Use “Transferir / continuar” quando houver vínculo anterior a aproveitar.</p>
            </div>
            <button onClick={onCloseEnrollment} className="p-2 text-slate-400"><X size={18} /></button>
          </div>
          <select value={classId} onChange={(event) => onClassChange(event.target.value)} className="mt-6 w-full rounded-xl border border-slate-200 p-4 text-sm font-bold">
            <option value="">Selecione a turma...</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.cursos?.nome} — {item.nome} — {item.polos?.nome}</option>)}
          </select>
          <button onClick={onPrepare} disabled={!classId || mutation.isPending} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] py-3.5 text-xs font-black uppercase text-white disabled:opacity-40">
            {mutation.isPending && <Loader2 size={15} className="animate-spin" />} Confirmar matrícula
          </button>
        </div>
      </div>
    )}
    {pendingClass && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl">
          <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Confirmação de matrícula</p>
              <h4 className="mt-1 font-black">{pendingClass.nome}</h4>
            </div>
            <button onClick={onCloseConfirmation} className="rounded-full p-2 text-blue-200 hover:bg-white/10"><X size={18} /></button>
          </div>
          <div className="space-y-4 p-6">
            {pendingClass.cursos?.modalidade === 'TECNICO' ? (
              <>
                <p className="text-sm font-semibold leading-relaxed text-slate-600">
                  {requiresPaymentMethod
                    ? 'Ao confirmar, o sistema vai registrar a matrícula, gerar o Contas a Receber e encaminhar a cobrança inicial pela rota bancária escolhida.'
                    : 'Ao confirmar, o sistema vai registrar a matrícula preservando a regra financeira legada, sem criar cobrança inicial.'}
                </p>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Valor da matrícula</p>
                  <p className="mt-1 text-2xl font-black text-emerald-800">{formatCurrency(Number(pendingClass.valor_matricula || 0))}</p>
                </div>
                {requiresPaymentMethod && (
                  <fieldset className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <legend className="px-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
                      Método da cobrança inicial
                    </legend>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      {visiblePaymentMethods.map(([value, label]) => (
                        <label
                          key={value}
                          className={`cursor-pointer rounded-xl border px-3 py-3 text-center text-[10px] font-black uppercase tracking-wide ${
                            paymentMethod === value
                              ? 'border-blue-500 bg-blue-600 text-white'
                              : 'border-blue-100 bg-white text-slate-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="partner-enrollment-payment-method"
                            value={value}
                            checked={paymentMethod === value}
                            onChange={() => onPaymentMethodChange(value)}
                            className="sr-only"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {requiresGatewayValidation && paymentOptionsLoading && (
                      <p className="mt-2 text-[10px] font-semibold text-blue-700">
                        Validando rotas e credenciais bancárias...
                      </p>
                    )}
                    {requiresGatewayValidation && paymentOptionsError && (
                      <p className="mt-2 text-[10px] font-semibold text-rose-700">
                        {paymentOptionsError}
                      </p>
                    )}
                    {requiresGatewayValidation
                      && !paymentOptionsLoading
                      && !paymentOptionsError
                      && visiblePaymentMethods.length === 0 && (
                      <p className="mt-2 text-[10px] font-semibold text-rose-700">
                        Nenhum método possui rota ativa e credencial pronta neste ambiente.
                      </p>
                    )}
                    {!paymentMethod && (
                      <p className="mt-2 text-[10px] font-semibold text-amber-700">
                        Escolha um método antes de confirmar.
                      </p>
                    )}
                  </fieldset>
                )}
                {requiresPaymentMethod && (
                  <p className="rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-500">
                    A baixa automática ocorrerá somente após a confirmação canônica do provedor selecionado.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold leading-relaxed text-slate-600">Esta ação vai registrar a matrícula no histórico acadêmico do aluno.</p>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={onCloseConfirmation} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">Cancelar</button>
              <button
                onClick={onConfirm}
                disabled={mutation.isPending
                  || (requiresPaymentMethod && !paymentMethod)
                  || (requiresGatewayValidation && (
                    paymentOptionsLoading
                    || Boolean(paymentOptionsError)
                    || visiblePaymentMethods.length === 0
                  ))}
                className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white disabled:opacity-50"
              >
                {mutation.isPending ? 'Gerando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  );
};

interface OperationModalProps {
  selected: any;
  mode: OperationMode;
  movementType: AcademicMovementType;
  transferType: TransferType;
  destinationClassId: string;
  destinationInstitution: string;
  destinationClasses: any[];
  reason: string;
  notes: string;
  returnDate: string;
  movementMutation: any;
  transferMutation: any;
  onCloseOperation: () => void;
  onModeChange: (value: OperationMode) => void;
  onMovementTypeChange: (value: AcademicMovementType) => void;
  onTransferTypeChange: (value: TransferType) => void;
  onDestinationClassChange: (value: string) => void;
  onDestinationInstitutionChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onReturnDateChange: (value: string) => void;
}

const OperationModal: React.FC<OperationModalProps> = (props) => {
  const { selected, mode, movementType, transferType, destinationClassId,
    destinationInstitution, destinationClasses, reason, notes, returnDate,
    movementMutation, transferMutation } = props;
  if (!selected) return null;
  const pending = movementMutation.isPending || transferMutation.isPending;
  const invalidDestination = mode === 'TRANSFERENCIA' && (
    transferType === 'EXTERNA_ENVIADA' ? !destinationInstitution.trim() : !destinationClassId
  );
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
          <div><p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Matrícula</p><h4 className="mt-1 font-black">{selected.turmas?.nome}</h4></div>
          <button onClick={props.onCloseOperation} className="p-2 text-blue-200"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button onClick={() => props.onModeChange('MOVIMENTACAO')} className={`rounded-lg py-2.5 text-xs font-black uppercase ${mode === 'MOVIMENTACAO' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Situação</button>
            <button onClick={() => props.onModeChange('TRANSFERENCIA')} className={`rounded-lg py-2.5 text-xs font-black uppercase ${mode === 'TRANSFERENCIA' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>Transferência</button>
          </div>
          {mode === 'MOVIMENTACAO' ? (
            <>
              <select value={movementType} onChange={(event) => props.onMovementTypeChange(event.target.value as AcademicMovementType)} className="w-full rounded-xl border border-slate-200 p-3.5 font-bold">
                {['TRANCADO', 'CANCELADO', 'DESISTENTE'].includes(selected.status) ? <option value="REATIVACAO">{movementLabels.REATIVACAO}</option> : <>
                  <option value="TRANCAMENTO">{movementLabels.TRANCAMENTO}</option><option value="CANCELAMENTO">{movementLabels.CANCELAMENTO}</option>
                  <option value="DESISTENCIA">{movementLabels.DESISTENCIA}</option><option value="CONCLUSAO">{movementLabels.CONCLUSAO}</option>
                </>}
              </select>
              {movementType === 'TRANCAMENTO' && <input type="date" value={returnDate} onChange={(event) => props.onReturnDateChange(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3.5" />}
            </>
          ) : (
            <>
              <select value={transferType} onChange={(event) => props.onTransferTypeChange(event.target.value as TransferType)} className="w-full rounded-xl border border-slate-200 p-3.5 font-bold">
                <option value="INTERNA_TURMA">Continuar em outra turma</option><option value="INTERNA_POLO">Continuar em outro polo</option><option value="EXTERNA_ENVIADA">Transferência externa</option>
              </select>
              {transferType === 'EXTERNA_ENVIADA' ? <input value={destinationInstitution} onChange={(event) => props.onDestinationInstitutionChange(event.target.value)} placeholder="Instituição de destino" className="w-full rounded-xl border border-slate-200 p-3.5" /> : (
                <select value={destinationClassId} onChange={(event) => props.onDestinationClassChange(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3.5">
                  <option value="">Selecione a turma de destino...</option>{destinationClasses.map((item) => <option key={item.id} value={item.id}>{item.cursos?.nome} — {item.nome} — {item.polos?.nome}</option>)}
                </select>
              )}
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4 text-xs font-semibold text-violet-800">
                {selected.status === 'ATIVO'
                  ? 'Disciplinas aprovadas serão aproveitadas. Pagamentos anteriores ficam na origem e parcelas futuras seguem para a nova matrícula.'
                  : 'O retorno cria uma nova matrícula e preserva disciplinas aprovadas. Revise o financeiro da nova turma; nenhuma taxa inicial será criada automaticamente.'}
              </div>
            </>
          )}
          <input value={reason} onChange={(event) => props.onReasonChange(event.target.value)} placeholder="Motivo obrigatório" className="w-full rounded-xl border border-slate-200 p-3.5" />
          <textarea value={notes} onChange={(event) => props.onNotesChange(event.target.value)} placeholder="Observações" className="min-h-24 w-full resize-none rounded-xl border border-slate-200 p-3.5" />
          {(movementMutation.isError || transferMutation.isError) && <p className="text-xs font-bold text-rose-600">{movementMutation.error?.message || transferMutation.error?.message}</p>}
          <button onClick={() => mode === 'MOVIMENTACAO' ? movementMutation.mutate() : transferMutation.mutate()} disabled={!reason.trim() || pending || invalidDestination} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] py-3.5 text-xs font-black uppercase text-white disabled:opacity-40">
            {pending ? <Loader2 size={15} className="animate-spin" /> : mode === 'TRANSFERENCIA' ? <ArrowRightLeft size={15} /> : movementType === 'REATIVACAO' ? <RotateCcw size={15} /> : movementType === 'CONCLUSAO' ? <CheckCircle2 size={15} /> : movementType === 'CANCELAMENTO' || movementType === 'DESISTENCIA' ? <Ban size={15} /> : <PauseCircle size={15} />}
            Confirmar operação
          </button>
        </div>
      </div>
    </div>
  );
};

interface Props extends EnrollmentModalProps, OperationModalProps {}

const ParceiroAlunoMatriculasModals: React.FC<Props> = (props) => <>
  <EnrollmentModals {...props} />
  <OperationModal {...props} />
</>;

export default ParceiroAlunoMatriculasModals;

import React from 'react';
import { Calendar, DollarSign, X } from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import { TurmaFinanceiroMatriculaConfig } from '../../turma-alunos.service';

export type EnrollmentStep = 'PREVIEW' | 'FINANCEIRO';

export interface EnrollmentFinance {
  valorMatricula: number;
  valorParcela: number;
  valorRematricula: number;
  dataVencimentoMatricula: string;
  diaVencimento: number;
}

interface ConfirmarMatriculaModalProps {
  turma: Turma;
  student: any;
  step: EnrollmentStep;
  finance: EnrollmentFinance;
  turmaFinanceiroConfig?: TurmaFinanceiroMatriculaConfig;
  isPending: boolean;
  onStepChange: (step: EnrollmentStep) => void;
  onFinanceChange: (field: keyof EnrollmentFinance, value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const ConfirmarMatriculaModal: React.FC<ConfirmarMatriculaModalProps> = ({
  turma,
  student,
  step,
  finance,
  turmaFinanceiroConfig,
  isPending,
  onStepChange,
  onFinanceChange,
  onClose,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-2xl">
      <div className="flex items-start justify-between bg-[#001a33] p-6 text-white">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Confirmação de matrícula</p>
          <h3 className="mt-1 text-xl font-black">{student.nome}</h3>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-blue-200 hover:bg-white/10">
          <X size={18} />
        </button>
      </div>
      <div className="border-b border-slate-100 bg-slate-50 px-6 py-3">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-200/70 p-1">
          <button
            onClick={() => onStepChange('PREVIEW')}
            className={`rounded-lg py-2 text-[10px] font-black uppercase ${step === 'PREVIEW' ? 'bg-white text-[#001a33] shadow-sm' : 'text-slate-500'}`}
          >
            Preview
          </button>
          <button
            onClick={() => onStepChange('FINANCEIRO')}
            className={`rounded-lg py-2 text-[10px] font-black uppercase ${step === 'FINANCEIRO' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
          >
            Vencimento e valores
          </button>
        </div>
      </div>

      <div className="space-y-5 p-6">
        {step === 'PREVIEW' ? (
          <>
            <p className="text-sm font-semibold leading-relaxed text-slate-600">
              Confira os dados antes de vincular o aluno à turma <strong className="text-[#001a33]">{turma.nome}</strong>.
              O valor padrão vem da configuração financeira desta turma e poderá ser ajustado no próximo passo.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Turma</p>
                <p className="mt-1 text-sm font-black text-[#001a33]">{turma.codigo || turma.nome}</p>
                <p className="mt-0.5 text-[10px] font-bold text-slate-500">{turma.cursoNome}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                  <DollarSign size={12} /> Matrícula
                </p>
                <p className="mt-1 text-xl font-black text-emerald-800">{formatCurrency(finance.valorMatricula)}</p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-700">
                  <Calendar size={12} /> Mensalidade
                </p>
                <p className="mt-1 text-xl font-black text-blue-800">{formatCurrency(finance.valorParcela)}</p>
                <p className="mt-0.5 text-[10px] font-bold text-blue-600">
                  {turmaFinanceiroConfig?.qtdParcelas || 11} parcelas por ciclo
                </p>
              </div>
            </div>
            <p className="rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-relaxed text-slate-500">
              A matrícula será a única cobrança inicial. Após a confirmação do pagamento, o sistema gera o carnê de mensalidades; ao fim do ciclo, gera a rematrícula e repete o processo após a baixa.
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">
                Cancelar
              </button>
              <button
                onClick={() => onStepChange('FINANCEIRO')}
                className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white"
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Vencimento da matrícula</span>
                <input
                  type="date"
                  value={finance.dataVencimentoMatricula}
                  onChange={(event) => onFinanceChange('dataVencimentoMatricula', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Dia das mensalidades</span>
                <select
                  value={finance.diaVencimento}
                  onChange={(event) => onFinanceChange('diaVencimento', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                >
                  {[5, 10, 15, 20, 25, 28].map((day) => (
                    <option key={day} value={day}>Todo dia {String(day).padStart(2, '0')}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valor da matrícula</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={finance.valorMatricula}
                  onChange={(event) => onFinanceChange('valorMatricula', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valor da mensalidade</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={finance.valorParcela}
                  onChange={(event) => onFinanceChange('valorParcela', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                />
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Valor da rematrícula</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={finance.valorRematricula}
                  onChange={(event) => onFinanceChange('valorRematricula', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Resumo financeiro individual</p>
              <p className="mt-2 text-xs font-bold leading-relaxed text-emerald-800">
                Matrícula de {formatCurrency(finance.valorMatricula)} com vencimento em{' '}
                {finance.dataVencimentoMatricula
                  ? new Date(`${finance.dataVencimentoMatricula}T00:00:00`).toLocaleDateString('pt-BR')
                  : 'sem data definida'}.
                Depois da baixa, serão geradas {turmaFinanceiroConfig?.qtdParcelas || 11} mensalidades de{' '}
                {formatCurrency(finance.valorParcela)}. A rematrícula será de{' '}
                {formatCurrency(finance.valorRematricula)} após o ciclo.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => onStepChange('PREVIEW')} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500">
                Voltar
              </button>
              <button
                onClick={onConfirm}
                disabled={isPending}
                className="flex-[1.4] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white disabled:opacity-50"
              >
                {isPending ? 'Gerando...' : 'Confirmar e gerar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  </div>
);

export default ConfirmarMatriculaModal;

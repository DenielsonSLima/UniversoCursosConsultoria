import React from 'react';
import { CalendarDays, CheckCircle2, FileText, GraduationCap, MapPin, ReceiptText, Users2, WalletCards } from 'lucide-react';
import type { StatusTurma } from '../../../gestao.types';
import TechnicalAcademicSettings from '../TechnicalAcademicSettings';
import { TURMA_TECNICO_FINANCIAL_STATE_OPTIONS } from './turma-tecnico-form.constants';
import type {
  TurmaTecnicoCourseOption,
  TurmaTecnicoFormData,
  TurmaTecnicoIdentity,
  TurmaTecnicoPoloOption,
} from './turma-tecnico-form.types';
import { formatCurrencyBRL } from './turma-tecnico-form.utils';

interface TurmaTecnicoReviewStepProps {
  course?: TurmaTecnicoCourseOption;
  formData: TurmaTecnicoFormData;
  identity: TurmaTecnicoIdentity;
  initialStatus: StatusTurma;
  polo?: TurmaTecnicoPoloOption;
  onChange: (patch: Partial<TurmaTecnicoFormData>) => void;
}

const TurmaTecnicoReviewStep: React.FC<TurmaTecnicoReviewStepProps> = ({
  course,
  formData,
  identity,
  initialStatus,
  polo,
  onChange,
}) => (
  <section aria-labelledby="review-step-title" className="space-y-6">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600">Etapa 5</p>
      <h4 id="review-step-title" className="mt-1 text-lg font-black uppercase tracking-tight text-[#001a33]">Regras acadêmicas e revisão</h4>
      <p className="mt-1 text-xs font-medium text-slate-500">Ajuste os critérios finais e confira a configuração antes de criar.</p>
    </div>

    <TechnicalAcademicSettings
      frequenciaMinimaPercent={formData.frequenciaMinimaPercent}
      mediaMinima={formData.mediaMinima}
      onChange={onChange}
    />

    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={17} className="text-emerald-600" />
        <p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Resumo da nova turma</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><GraduationCap size={12} /> Curso</p>
          <p className="mt-1 text-xs font-black text-[#001a33]">{course?.nome || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><MapPin size={12} /> Polo</p>
          <p className="mt-1 text-xs font-black text-[#001a33]">{polo?.cidade || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><CalendarDays size={12} /> Período</p>
          <p className="mt-1 text-xs font-black text-[#001a33]">{formData.dataInicio || '—'} a {formData.dataPrevisaoTermino || '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-3">
          <p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><Users2 size={12} /> Capacidade</p>
          <p className="mt-1 text-xs font-black text-[#001a33]">{formData.vagasTotais} vagas · {formData.turno.toLowerCase()}</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
        <p className="text-[9px] font-black uppercase text-slate-400">Identificação automática</p>
        <p className="mt-1 text-sm font-black text-[#001a33]">{identity.nome || '—'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-mono text-[10px] font-black text-slate-700">{identity.codigo || '—'}</span>
          <span className="rounded-lg bg-emerald-100 px-2.5 py-1.5 text-[9px] font-black uppercase text-emerald-700">{initialStatus.replaceAll('_', ' ')}</span>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
      <div className="flex items-center gap-2"><WalletCards size={17} className="text-blue-600" /><p className="text-xs font-black uppercase tracking-wide text-[#001a33]">Plano financeiro</p></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-3"><p className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400"><ReceiptText size={12} /> Matrícula</p><p className="mt-1 text-sm font-black text-[#001a33]">{formData.cobrarMatricula ? formatCurrencyBRL(formData.valorMatricula) : 'Não gerar'}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Mensalidades por ciclo</p><p className="mt-1 text-sm font-black text-[#001a33]">{formData.qtdParcelas}x de {formatCurrencyBRL(formData.valorParcela)}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Rematrícula</p><p className="mt-1 text-sm font-black text-[#001a33]">{formData.cobrarRematricula ? formatCurrencyBRL(formData.valorRematricula) : 'Não cobrar'}</p></div>
        <div className="rounded-xl bg-white p-3"><p className="text-[9px] font-black uppercase text-slate-400">Primeiro vencimento</p><p className="mt-1 text-sm font-black text-[#001a33]">{formData.estadoFinanceiroInicial === 'IMPORTADA_CONCLUIDA' ? 'Não se aplica' : formData.primeiroVencimentoPadrao || '—'}</p><p className="mt-1 text-[9px] font-semibold text-slate-400">{formData.estadoFinanceiroInicial === 'IMPORTADA_CONCLUIDA' ? 'Sem novo ciclo financeiro' : `Depois, todo dia ${String(formData.diaVencimentoPadrao).padStart(2, '0')}`}</p></div>
      </div>
      <div className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-3">
        <p className="text-[9px] font-black uppercase text-blue-500">Fluxo manual · sem cobrança ao adicionar aluno</p>
        <p className="mt-1 text-[11px] font-black text-blue-900">{TURMA_TECNICO_FINANCIAL_STATE_OPTIONS.find((option) => option.value === formData.estadoFinanceiroInicial)?.title}</p>
        <p className="mt-1 text-[10px] font-semibold leading-relaxed text-blue-700">{TURMA_TECNICO_FINANCIAL_STATE_OPTIONS.find((option) => option.value === formData.estadoFinanceiroInicial)?.nextAction}</p>
        {formData.estadoFinanceiroInicial !== 'IMPORTADA_CONCLUIDA' ? (
          <p className="mt-2 text-[10px] font-semibold text-slate-500">Elegibilidade: {formData.criterioElegibilidadeCiclo === 'PENULTIMA_SEM_ATRASO' ? 'penúltima paga e nenhuma parcela vencida' : 'quitação total do ciclo anterior'}.</p>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[9px] font-black uppercase text-emerald-700">Desconto</p><p className="mt-1 text-xs font-black text-emerald-800">{formatCurrencyBRL(formData.descontoPontualidade)}</p></div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-600">Juros proporcional</p><p className="mt-1 text-xs font-black text-rose-700">{formData.jurosAtraso}% ao mês</p></div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><p className="text-[9px] font-black uppercase text-rose-600">Multa única</p><p className="mt-1 text-xs font-black text-rose-700">{formData.multaAtrasoPercentual}%</p></div>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-[9px] font-black uppercase text-amber-700"><FileText size={12} /> Impresso no boleto e no carnê</p>
        <p className="mt-1 text-[11px] font-bold leading-relaxed text-amber-900">{formData.instrucaoBoletoCarne}</p>
      </div>
    </div>

    <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-violet-700">Condições individuais protegidas</p>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-violet-900">Um código de autorização foi definido para liberar bolsa, incentivo ou valor especial. O código não será exibido após a criação.</p>
    </div>
  </section>
);

export default TurmaTecnicoReviewStep;

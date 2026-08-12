import React from 'react';
import { AlertCircle, CalendarDays, CircleDollarSign, Loader2, ReceiptText, RefreshCw, Users } from 'lucide-react';
import type { Turma } from '../../gestao.types';
import { formatCurrencyBRL, formatDateBR, formatPercentageBR } from '../formatters';
import { usePlanoFinanceiroUnicoWorkspace } from '../hooks/usePlanoFinanceiroUnico';

interface TurmaPlanoFinanceiroUnicoProps {
  turma: Turma;
}

const SummaryCard: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone: 'blue' | 'emerald' | 'amber' | 'slate';
}> = ({ label, value, hint, icon, tone }) => {
  const tones = {
    blue: 'border-blue-100 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <article className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={`rounded-xl border p-2.5 ${tones[tone]}`}>{icon}</span>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-[#001a33]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</p> : null}
    </article>
  );
};

const TurmaPlanoFinanceiroUnico: React.FC<TurmaPlanoFinanceiroUnicoProps> = ({ turma }) => {
  const workspaceQuery = usePlanoFinanceiroUnicoWorkspace(turma.id);
  const workspace = workspaceQuery.data;
  const regra = workspace?.regra;
  const resumo = workspace?.resumo;

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-100 bg-white py-14 shadow-sm">
        <Loader2 size={26} className="animate-spin text-[#001a33]" />
        <span className="ml-3 text-sm font-bold text-slate-500">Carregando o plano financeiro da turma...</span>
      </div>
    );
  }

  if (workspaceQuery.isError) {
    return (
      <div className="rounded-2xl border border-rose-100 bg-rose-50 p-7 text-center shadow-sm">
        <AlertCircle className="mx-auto text-rose-600" size={28} />
        <h3 className="mt-3 text-sm font-black uppercase tracking-wider text-rose-900">Plano financeiro não carregado</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-relaxed text-rose-700">Os valores foram ocultados para não apresentar cobranças incompletas. Recarregue antes de consultar ou gerar parcelas.</p>
        <button type="button" onClick={() => { void workspaceQuery.refetch(); }} disabled={workspaceQuery.isFetching} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-rose-700 disabled:opacity-50">
          <RefreshCw size={14} className={workspaceQuery.isFetching ? 'animate-spin' : ''} /> Tentar novamente
        </button>
      </div>
    );
  }

  if (!workspace?.configurado || !regra || !resumo) {
    return (
      <div className="rounded-2xl border border-amber-100 bg-amber-50 p-7 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 shrink-0 text-amber-600" size={22} />
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-amber-900">Plano financeiro ainda não configurado</h3>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-amber-800">Esta turma não possui o plano único de Curso Livre/Especialização. Para proteger os valores, nenhuma parcela pode ser criada até que exista uma configuração financeira válida.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-600"><ReceiptText size={14} /> Plano único da turma</p>
            <h3 className="mt-2 text-xl font-black tracking-tight text-[#001a33]">{turma.nome}</h3>
            <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">O valor integral do curso é distribuído no número de parcelas definido para esta turma. Não há cobranças de matrícula ou rematrícula neste plano.</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-right text-blue-800">
            <p className="text-[10px] font-black uppercase tracking-wider">Revisão vigente</p>
            <p className="mt-0.5 text-sm font-black">#{regra.revisao}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Valor total do curso" value={formatCurrencyBRL(regra.valorTotal)} icon={<CircleDollarSign size={19} />} tone="blue" />
        <SummaryCard label="Parcelamento configurado" value={`${regra.qtdParcelas} parcela${regra.qtdParcelas === 1 ? '' : 's'}`} hint="Cobrança por boleto" icon={<ReceiptText size={19} />} tone="slate" />
        <SummaryCard label="Alunos com plano gerado" value={String(resumo.alunosComPlano)} hint={`${resumo.parcelasGeradas} parcelas lançadas`} icon={<Users size={19} />} tone="emerald" />
        <SummaryCard label="Em aberto" value={formatCurrencyBRL(resumo.emAberto)} hint={`Recebido: ${formatCurrencyBRL(resumo.totalRecebido)}`} icon={<CalendarDays size={19} />} tone="amber" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
          <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Regra aplicada às parcelas</h4>
          <dl className="mt-5 divide-y divide-slate-100">
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs font-semibold text-slate-500">Primeiro vencimento</dt><dd className="text-sm font-black text-[#001a33]">{formatDateBR(regra.primeiroVencimento)}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs font-semibold text-slate-500">Dia padrão das próximas</dt><dd className="text-sm font-black text-[#001a33]">Dia {regra.diaVencimento}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs font-semibold text-slate-500">Desconto por pontualidade</dt><dd className="text-sm font-black text-emerald-700">{formatCurrencyBRL(regra.descontoPontualidade)}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs font-semibold text-slate-500">Juros por atraso</dt><dd className="text-sm font-black text-amber-700">{formatPercentageBR(regra.jurosAtrasoPercentual)}% ao mês</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs font-semibold text-slate-500">Multa por atraso</dt><dd className="text-sm font-black text-rose-700">{formatCurrencyBRL(regra.multaAtraso)}</dd></div>
          </dl>
        </article>

        <article className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-5">
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Cronograma pré-configurado</h4>
              <p className="mt-1 text-xs font-semibold text-slate-500">Será copiado para cada aluno no momento da matrícula.</p>
            </div>
            <span className="rounded-xl bg-slate-100 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600">{regra.cronograma.length} itens</span>
          </div>
          <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-100">
            {regra.cronograma.map((parcela) => (
              <div key={parcela.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-6 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-xs font-black text-blue-700">{parcela.numero}</span>
                <div><p className="text-sm font-black text-[#001a33]">{parcela.label}</p><p className="mt-0.5 text-[11px] font-semibold text-slate-500">Boleto · vence em {formatDateBR(parcela.dataVencimento)}</p></div>
                <p className="text-sm font-black text-[#001a33]">{formatCurrencyBRL(parcela.valor)}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
};

export default TurmaPlanoFinanceiroUnico;

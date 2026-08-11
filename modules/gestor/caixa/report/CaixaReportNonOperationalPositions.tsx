import React from 'react';
import {
  formatCaixaCanonicalCurrency,
  formatCaixaCurrency,
} from '../caixa.formatters';
import type { CaixaDetailedReport } from './caixa-report.types';

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const PositionMetric: React.FC<{
  label: string;
  value: string;
  helper: string;
  tone?: 'blue' | 'emerald' | 'rose' | 'amber' | 'slate';
}> = ({ label, value, helper, tone = 'slate' }) => {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/70 text-blue-900',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-800',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-800',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-800',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  };

  return (
    <div className={`min-w-0 rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[8px] font-black uppercase tracking-wide text-slate-600">{label}</p>
      <p className="mt-1 break-words text-sm font-black leading-tight">{value}</p>
      <p className="mt-1 text-[7.5px] leading-3 text-slate-600">{helper}</p>
    </div>
  );
};

const PositionPanel: React.FC<{
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ eyebrow, title, description, children }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
    <header className="border-b border-slate-100 pb-2">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p>
      <h2 className="mt-0.5 text-[13px] font-black uppercase tracking-tight text-[#001a33]">{title}</h2>
      <p className="mt-1 text-[8px] leading-3 text-slate-500">{description}</p>
    </header>
    {children}
  </section>
);

const RestrictedPosition: React.FC<{ label: string }> = ({ label }) => (
  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-4 text-center">
    <p className="text-[9px] font-black uppercase tracking-wide text-amber-900">
      Dados de {label.toLowerCase()} indisponíveis
    </p>
    <p className="mt-1 text-[8px] leading-3 text-amber-800">
      Este perfil não possui o escopo complementar necessário. A prestação operacional permanece disponível.
    </p>
  </div>
);

export const CaixaReportNonOperationalPositions: React.FC<{
  report: CaixaDetailedReport;
}> = ({ report }) => {
  const patrimonio = report.patrimonio;
  const financiamento = report.financiamento;
  const posicaoLiquida = report.posicaoLiquida;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-blue-600">
          Posição complementar
        </p>
        <h1 className="mt-0.5 text-lg font-black uppercase tracking-tight text-[#001a33]">
          Patrimônio e financiamento
        </h1>
        <p className="mt-1 text-[9px] text-slate-500">
          Posições canônicas da competência, exibidas separadamente do fluxo operacional.
        </p>
      </div>

      <PositionPanel
        eyebrow="Posição patrimonial líquida"
        title="Patrimônio a custo menos empréstimos a pagar"
        description="Apuração canônica do fechamento, separada do caixa e do resultado operacional."
      >
        {posicaoLiquida.disponivel ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            <PositionMetric
              label="Patrimônio a custo"
              value={formatCaixaCanonicalCurrency(posicaoLiquida.dados.valorPatrimonialCusto)}
              helper="Bens ativos no fechamento"
              tone="blue"
            />
            <PositionMetric
              label="Empréstimos a pagar"
              value={formatCaixaCanonicalCurrency(posicaoLiquida.dados.saldoEmprestimosAPagar)}
              helper="Parcelas ainda devidas, com encargos"
              tone="rose"
            />
            <PositionMetric
              label="Valor líquido"
              value={formatCaixaCanonicalCurrency(posicaoLiquida.dados.valorLiquido)}
              helper="Ativo a custo menos empréstimos a pagar"
              tone={posicaoLiquida.dados.valorLiquido.startsWith('-') ? 'rose' : 'emerald'}
            />
          </div>
        ) : <RestrictedPosition label="posição líquida" />}
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[8px] leading-3 text-blue-900">
          {posicaoLiquida.disponivel ? posicaoLiquida.dados.observacao : (
            <><strong>Leitura correta:</strong> a posição líquida exige os escopos patrimonial e financeiro.</>
          )}
        </p>
      </PositionPanel>

      <PositionPanel
        eyebrow="Posição patrimonial"
        title="Bens e perdas reconhecidos a custo"
        description="Fechamento recalculável da competência selecionada."
      >
        {patrimonio.disponivel ? (
          <div className="mt-3 grid grid-cols-4 gap-2">
            <PositionMetric
              label="Valor ativo a custo"
              value={formatCaixaCanonicalCurrency(patrimonio.dados.posicaoFechamento.valorAtivoCusto)}
              helper={`${quantityFormatter.format(patrimonio.dados.posicaoFechamento.registrosAtivos)} registro(s) ativo(s)`}
              tone="blue"
            />
            <PositionMetric
              label="Unidades ativas"
              value={quantityFormatter.format(patrimonio.dados.posicaoFechamento.unidadesAtivas)}
              helper="Disponíveis no fechamento"
            />
            <PositionMetric
              label="Aquisições"
              value={formatCaixaCanonicalCurrency(patrimonio.dados.aquisicoesCompetencia.valorCusto)}
              helper={`${quantityFormatter.format(patrimonio.dados.aquisicoesCompetencia.registros)} registro(s) · ${quantityFormatter.format(patrimonio.dados.aquisicoesCompetencia.unidades)} unidade(s)`}
              tone="emerald"
            />
            <PositionMetric
              label="Perdas"
              value={formatCaixaCanonicalCurrency(patrimonio.dados.perdasCompetencia.valorCusto)}
              helper={`${quantityFormatter.format(patrimonio.dados.perdasCompetencia.movimentos)} baixa(s) · ${quantityFormatter.format(patrimonio.dados.perdasCompetencia.unidades)} unidade(s)`}
              tone="rose"
            />
          </div>
        ) : <RestrictedPosition label="Patrimônio" />}
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[8px] leading-3 text-blue-900">
          <strong>Posição isolada:</strong> patrimônio a custo não altera saldo, entradas, saídas ou resultado operacional.
        </p>
      </PositionPanel>

      <PositionPanel
        eyebrow="Financiamento e rateios"
        title="Empréstimos e obrigações do escopo"
        description="Crédito, principal e encargos são apresentados fora da receita e despesa operacional."
      >
        {financiamento.disponivel ? (
          <div className="mt-3 grid grid-cols-5 gap-2">
            <PositionMetric
              label="Crédito liberado"
              value={formatCaixaCurrency(financiamento.dados.creditoLiberadoMatriz)}
              helper="Liberação no escopo"
              tone="blue"
            />
            <PositionMetric
              label="Obrigações rateadas"
              value={formatCaixaCurrency(financiamento.dados.obrigacaoRateada)}
              helper="Compromissos da competência"
              tone="rose"
            />
            <PositionMetric
              label="Principal rateado"
              value={formatCaixaCurrency(financiamento.dados.principalRateado)}
              helper="Componente de capital"
            />
            <PositionMetric
              label="Encargos rateados"
              value={formatCaixaCurrency(financiamento.dados.encargosRateados)}
              helper="Juros e demais encargos"
              tone="amber"
            />
            <PositionMetric
              label="Baixado no polo"
              value={formatCaixaCurrency(financiamento.dados.pagoRateado)}
              helper="Pagamento confirmado"
              tone="emerald"
            />
          </div>
        ) : <RestrictedPosition label="Financiamento" />}
        <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[8px] leading-3 text-blue-900">
          <strong>Leitura correta:</strong> crédito, principal e encargos de empréstimo são financiamento e não compõem o resultado operacional.
        </p>
      </PositionPanel>
    </div>
  );
};

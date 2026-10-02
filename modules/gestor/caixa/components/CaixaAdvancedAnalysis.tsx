import React from 'react';
import {
  Archive,
  Building2,
  ChevronDown,
  Landmark,
  LineChart,
  Scale,
} from 'lucide-react';

interface CaixaAdvancedAnalysisProps {
  posicaoTotal: React.ReactNode;
  posicaoLiquida: React.ReactNode;
  patrimonio: React.ReactNode;
  convenios: React.ReactNode;
  financiamento: React.ReactNode;
  linhaCorte: React.ReactNode;
  lineCutAttention?: boolean;
}

interface AnalysisDisclosureProps {
  title: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  attention?: boolean;
  defaultOpen?: boolean;
}

/**
 * Mantém leituras estruturais completas sem competir com o fluxo mensal. Os
 * conteúdos são recebidos prontos e não têm seus contratos reinterpretados.
 */
export const CaixaAdvancedAnalysis: React.FC<CaixaAdvancedAnalysisProps> = ({
  posicaoTotal,
  posicaoLiquida,
  patrimonio,
  convenios,
  financiamento,
  linhaCorte,
  lineCutAttention = false,
}) => (
  <section aria-labelledby="caixa-advanced-analysis-title" className="rounded-3xl border border-slate-200 bg-slate-100/60 p-4 sm:p-5">
    <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">Análises avançadas</p>
        <h2 id="caixa-advanced-analysis-title" className="mt-1 text-lg font-extrabold text-[#001a33]">
          Estrutura financeira e sustentabilidade
        </h2>
      </div>
      <p className="max-w-xl text-xs leading-5 text-slate-500 sm:text-right">
        Abra somente a leitura necessária. Patrimônio, financiamento e projeções não alteram o resultado operacional realizado.
      </p>
    </div>

    <div className="mt-4 space-y-3">
      <AnalysisDisclosure
        title="Posição e patrimônio"
        description="Caixa registrado, bens a custo e empréstimos no mesmo corte"
        badge="3 leituras"
        icon={<Scale size={17} aria-hidden="true" />}
        defaultOpen
      >
        <div className="space-y-3">
          {posicaoTotal}
          {posicaoLiquida}
          {patrimonio}
        </div>
      </AnalysisDisclosure>

      <AnalysisDisclosure
        title="Convênios e financiamento"
        description="Recursos vinculados, crédito, obrigações e rateios"
        badge="2 leituras"
        icon={<Building2 size={17} aria-hidden="true" />}
      >
        <div className="space-y-3">
          {convenios}
          {financiamento}
        </div>
      </AnalysisDisclosure>

      <AnalysisDisclosure
        title="Linha de corte e ponto de equilíbrio"
        description="Cobertura de custos e acompanhamento da meta operacional"
        badge={lineCutAttention ? 'Requer atenção' : 'Projeção'}
        icon={<LineChart size={17} aria-hidden="true" />}
        attention={lineCutAttention}
      >
        {linhaCorte}
      </AnalysisDisclosure>
    </div>

    <div className="mt-4 grid gap-2 text-[10px] leading-4 text-slate-500 sm:grid-cols-3">
      <ContextNote icon={<Archive size={12} aria-hidden="true" />}>
        Patrimônio permanece a custo e separado do caixa disponível.
      </ContextNote>
      <ContextNote icon={<Landmark size={12} aria-hidden="true" />}>
        Crédito de empréstimo não é receita operacional.
      </ContextNote>
      <ContextNote icon={<LineChart size={12} aria-hidden="true" />}>
        Linha de corte é projeção, não saldo bancário.
      </ContextNote>
    </div>
  </section>
);

const AnalysisDisclosure: React.FC<AnalysisDisclosureProps> = ({
  title,
  description,
  badge,
  icon,
  children,
  attention = false,
  defaultOpen = false,
}) => (
  <details open={defaultOpen} className={`group overflow-hidden rounded-2xl border bg-white shadow-sm ${
    attention ? 'border-amber-200' : 'border-slate-200'
  }`}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
      <span className={`rounded-xl p-2 ${
        attention ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{description}</span>
      </span>
      <span className={`hidden rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide sm:inline ${
        attention ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
      }`}>
        {badge}
      </span>
      <ChevronDown
        size={17}
        aria-hidden="true"
        className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
      />
    </summary>
    <div className="border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4">
      {children}
    </div>
  </details>
);

const ContextNote: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-start gap-2 rounded-xl bg-white/80 px-3 py-2">
    <span className="mt-0.5 shrink-0 text-blue-600">{icon}</span>
    <span>{children}</span>
  </div>
);

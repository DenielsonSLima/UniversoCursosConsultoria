import React from 'react';
import { Building2, LineChart, Scale, Sparkles } from 'lucide-react';
import './caixa-analysis.css';

interface CaixaAdvancedAnalysisProps {
  position: React.ReactNode;
  capital: React.ReactNode;
  lineCut: React.ReactNode;
  lineCutAttention?: boolean;
}

interface AnalysisChapterProps {
  number: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  attention?: boolean;
  last?: boolean;
}

/** Exibe as leituras estruturais como capítulos contínuos, sem escondê-las. */
export const CaixaAdvancedAnalysis: React.FC<CaixaAdvancedAnalysisProps> = ({
  position,
  capital,
  lineCut,
  lineCutAttention = false,
}) => (
  <section aria-labelledby="caixa-advanced-analysis-title" className="caixa-analysis space-y-5">
    <header className="caixa-analysis-heading rounded-xl border border-slate-200 bg-white px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
            <Sparkles size={11} aria-hidden="true" /> Leitura guiada
          </span>
          <h2 id="caixa-advanced-analysis-title" className="mt-1.5 text-[17px] font-medium tracking-tight text-[#122b42]">
            Estrutura, capital e sustentabilidade
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
            Uma leitura contínua do que a operação possui, do que está vinculado e do que precisa cobrir.
          </p>
        </div>

        <nav aria-label="Capítulos da análise financeira" className="flex flex-wrap gap-2">
          <ChapterLink href="#caixa-position-chapter" number="01" label="Posição" />
          <ChapterLink href="#caixa-capital-chapter" number="02" label="Capital" />
          <ChapterLink href="#caixa-line-cut-chapter" number="03" label="Equilíbrio" attention={lineCutAttention} />
        </nav>
      </div>
    </header>

    <div className="space-y-5">
      <AnalysisChapter
        number="01"
        eyebrow="O que está registrado"
        title="Posição e patrimônio"
        description="Caixa, bens e empréstimos no mesmo corte contábil."
        icon={<Scale size={17} aria-hidden="true" />}
      >
        <div id="caixa-position-chapter" className="scroll-mt-28">{position}</div>
      </AnalysisChapter>

      <AnalysisChapter
        number="02"
        eyebrow="O que tem destinação"
        title="Convênios e financiamento"
        description="Recursos vinculados, crédito, obrigações e rateios em trilhas separadas."
        icon={<Building2 size={17} aria-hidden="true" />}
      >
        <div id="caixa-capital-chapter" className="scroll-mt-28">{capital}</div>
      </AnalysisChapter>

      <AnalysisChapter
        number="03"
        eyebrow="O que sustenta a operação"
        title="Linha de corte e ponto de equilíbrio"
        description="Cobertura, margem, risco de inadimplência e comparação histórica."
        icon={<LineChart size={17} aria-hidden="true" />}
        attention={lineCutAttention}
        last
      >
        <div id="caixa-line-cut-chapter" className="scroll-mt-28">{lineCut}</div>
      </AnalysisChapter>
    </div>
  </section>
);

const AnalysisChapter: React.FC<AnalysisChapterProps> = ({
  number,
  eyebrow,
  title,
  description,
  icon,
  children,
  attention = false,
  last = false,
}) => (
  <article className="caixa-analysis-chapter min-w-0">
    <div className="mb-3 flex items-center gap-3">
      <span className={`hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-medium lg:flex ${
        attention ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
      }`}>
        {number}
      </span>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg lg:hidden ${attention ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[10px] font-medium tracking-wide ${attention ? 'text-amber-700' : 'text-slate-500'}`}>{eyebrow}</p>
          {attention ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">Requer atenção</span> : null}
        </div>
        <h3 className="mt-0.5 text-[15px] font-medium text-[#122b42]">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
    {children}
    {!last ? <div className="mt-5 h-px bg-slate-200 lg:hidden" /> : null}
  </article>
);

const ChapterLink: React.FC<{ href: string; number: string; label: string; attention?: boolean }> = ({ href, number, label, attention = false }) => (
  <a href={href} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transition-none ${
    attention
      ? 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700'
  }`}>
    <span className="text-[10px] text-current opacity-60">{number}</span>{label}
  </a>
);

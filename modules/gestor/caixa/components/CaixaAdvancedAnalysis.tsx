import React from 'react';
import { Building2, LineChart, Scale, Sparkles } from 'lucide-react';

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
  <section aria-labelledby="caixa-advanced-analysis-title" className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[#f5f8fc] px-4 py-6 sm:px-6 sm:py-8">
    <div className="pointer-events-none absolute bottom-10 left-[35px] top-44 hidden w-px bg-gradient-to-b from-blue-300 via-violet-200 to-transparent lg:block" />

    <header className="relative overflow-hidden rounded-[26px] bg-[#061a2f] px-5 py-6 text-white shadow-xl shadow-slate-900/10 sm:px-7">
      <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full border-[42px] border-blue-400/10" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200">
            <Sparkles size={11} aria-hidden="true" /> Leitura guiada
          </span>
          <h2 id="caixa-advanced-analysis-title" className="mt-3 text-xl font-black tracking-tight sm:text-2xl">
            Estrutura, capital e sustentabilidade
          </h2>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-300">
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

    <div className="mt-6 space-y-8">
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
  <article className="relative lg:pl-14">
    <div className="mb-4 flex items-start gap-3">
      <span className={`relative z-10 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-[#f5f8fc] text-[10px] font-black shadow-sm lg:flex ${
        attention ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
      }`}>
        {number}
      </span>
      <span className={`rounded-xl p-2 lg:hidden ${attention ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-[9px] font-bold uppercase tracking-[0.18em] ${attention ? 'text-amber-700' : 'text-blue-700'}`}>{eyebrow}</p>
          {attention ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-800">Requer atenção</span> : null}
        </div>
        <h3 className="mt-1 text-lg font-extrabold text-[#061a2f]">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </div>
    {children}
    {!last ? <div className="mx-auto mt-8 h-px w-2/3 bg-gradient-to-r from-transparent via-slate-200 to-transparent lg:hidden" /> : null}
  </article>
);

const ChapterLink: React.FC<{ href: string; number: string; label: string; attention?: boolean }> = ({ href, number, label, attention = false }) => (
  <a href={href} className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transition-none ${
    attention
      ? 'border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20'
      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
  }`}>
    <span className="text-[9px] opacity-60">{number}</span>{label}
  </a>
);

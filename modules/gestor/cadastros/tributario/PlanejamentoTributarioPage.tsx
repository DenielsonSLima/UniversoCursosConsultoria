import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  ChevronRight,
  Landmark,
  Search,
  Tags,
} from 'lucide-react';

type TributaryArticle = {
  category: string;
  title: string;
  summary: string;
  bullets: string[];
};

const knowledgeArticles: TributaryArticle[] = [
  {
    category: 'Simples Nacional',
    title: 'Fator R',
    summary: 'Quando a folha dos últimos 12 meses atinge 28% da receita bruta, algumas atividades podem migrar do Anexo V para o Anexo III.',
    bullets: [
      'Usado principalmente em serviços.',
      'Exige apuração mensal de folha e receita.',
      'Pode reduzir a alíquota efetiva.',
    ],
  },
  {
    category: 'Anexos',
    title: 'Anexo III',
    summary: 'Abrange serviços como desenvolvimento, educação, manutenção e consultoria quando atendem às regras aplicáveis.',
    bullets: [
      'Limite geral de R$ 4,8 milhões.',
      'Pode receber atividades pelo Fator R.',
      'Competitivo para serviços com folha relevante.',
    ],
  },
  {
    category: 'Simples Nacional',
    title: 'Quem não pode optar',
    summary: 'Empresas com atividade impeditiva, sócio PJ, débitos não regularizados ou faturamento acima do limite exigem revisão antes da opção.',
    bullets: [
      'Verificar CNAE principal e secundários.',
      'Revisar composição societária.',
      'Checar regularidade fiscal antes de janeiro.',
    ],
  },
  {
    category: 'Municipal',
    title: 'ISS no Simples',
    summary: 'O ISS é recolhido no DAS, mas regras municipais, retenções e local de incidência ainda precisam ser observados.',
    bullets: [
      'Pode haver retenção pelo tomador.',
      'Município pode exigir inscrição local.',
      'Serviços fora do município pedem revisão.',
    ],
  },
  {
    category: 'Regimes',
    title: 'MEI',
    summary: 'Regime simplificado para baixa receita, com limite e atividades permitidas próprias, sem substituir uma análise de crescimento.',
    bullets: [
      'Avaliar desenquadramento por faturamento.',
      'Conferir atividade permitida.',
      'Planejar migração antes de escalar.',
    ],
  },
];

const anexoIII = [
  { faixa: '1ª', faturamento: 'Até R$ 180.000,00', aliquota: '6,00%', deduzir: 'R$ 0,00', status: 'Entrada' },
  { faixa: '2ª', faturamento: 'R$ 180.000,01 a R$ 360.000,00', aliquota: '11,20%', deduzir: 'R$ 9.360,00', status: 'Atenção' },
  { faixa: '3ª', faturamento: 'R$ 360.000,01 a R$ 720.000,00', aliquota: '13,50%', deduzir: 'R$ 17.640,00', status: 'Revisar' },
  { faixa: '4ª', faturamento: 'R$ 720.000,01 a R$ 1.800.000,00', aliquota: '16,00%', deduzir: 'R$ 35.640,00', status: 'Projetar' },
  { faixa: '5ª', faturamento: 'R$ 1.800.000,01 a R$ 3.600.000,00', aliquota: '21,00%', deduzir: 'R$ 125.640,00', status: 'Simular' },
  { faixa: '6ª', faturamento: 'R$ 3.600.000,01 a R$ 4.800.000,00', aliquota: '33,00%', deduzir: 'R$ 648.000,00', status: 'Limite' },
];

const quickChecks = [
  { label: 'CNAE', value: 'Atividade principal e secundárias', icon: Tags },
  { label: 'Receita', value: 'Acumulado dos últimos 12 meses', icon: Calculator },
  { label: 'Folha', value: 'Base para avaliar Fator R', icon: Landmark },
  { label: 'Pendências', value: 'Débitos e regularidade fiscal', icon: AlertTriangle },
];

const PlanejamentoTributarioPage: React.FC = () => {
  const [query, setQuery] = useState('');

  const filteredArticles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return knowledgeArticles;

    return knowledgeArticles.filter((article) => {
      const searchable = [
        article.category,
        article.title,
        article.summary,
        ...article.bullets,
      ].join(' ').toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [query]);

  return (
    <div className="animate-fadeIn space-y-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            <BookOpenCheck size={14} />
            Base Tributária
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-[#001a33]">Planejamento Tributário</h2>
          <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">
            Consulte regras, anexos e pontos de atenção para enquadramento tributário de empresas e cursos.
          </p>
        </div>

        <div className="relative w-full lg:w-[420px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ICMS, ISS, Fator R, Anexo III, MEI..."
            className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickChecks.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#001a33] text-white">
                <Icon size={20} />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-slate-700">{item.value}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Base de conhecimento tributária</p>
            <h3 className="text-xl font-black text-[#001a33]">Pesquisar regra, imposto ou enquadramento</h3>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {filteredArticles.length} registros
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredArticles.map((article) => (
            <article key={`${article.category}-${article.title}`} className="flex min-h-[260px] flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">{article.category}</p>
              <h4 className="mt-2 text-lg font-black text-[#001a33]">{article.title}</h4>
              <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{article.summary}</p>
              <ul className="mt-4 space-y-2 text-sm font-semibold text-slate-600">
                {article.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={16} />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <button className="mt-auto inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700">
                Abrir artigo
                <ChevronRight size={16} />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Tabela contextual</p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h3 className="text-xl font-black text-[#001a33]">Anexo III com faixa destacada</h3>
          <span className="rounded-lg bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-emerald-700">
            Referência Simples Nacional
          </span>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-[780px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-5 py-4">Faixa</th>
                  <th className="px-5 py-4">Faturamento anual</th>
                  <th className="px-5 py-4">Alíquota nominal</th>
                  <th className="px-5 py-4">Valor a deduzir</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {anexoIII.map((row, index) => (
                  <tr key={row.faixa} className={index === 2 ? 'bg-amber-50/80 text-slate-900' : 'bg-white'}>
                    <td className="px-5 py-4 font-black">{row.faixa}</td>
                    <td className="px-5 py-4">{row.faturamento}</td>
                    <td className="px-5 py-4">{row.aliquota}</td>
                    <td className="px-5 py-4">{row.deduzir}</td>
                    <td className="px-5 py-4">
                      <span className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-slate-600">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlanejamentoTributarioPage;

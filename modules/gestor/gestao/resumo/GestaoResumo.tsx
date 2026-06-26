import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  GraduationCap,
  MonitorPlay,
  PieChart,
  TrendingUp,
  Users
} from 'lucide-react';
import { gestaoService } from '../gestao.service';

type TipoModalidade = 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD';

interface GestaoResumoProps {
  poloId?: string;
}

interface ModalidadeConfig {
  key: TipoModalidade;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number; }>; 
  tone: string;
  text: string;
  chip: string;
}

const typeConfig: ModalidadeConfig[] = [
  {
    key: 'TECNICO',
    label: 'Técnico',
    icon: Briefcase,
    tone: 'from-blue-500 to-indigo-500',
    text: 'text-blue-700',
    chip: 'border-blue-100 bg-blue-50 text-blue-700'
  },
  {
    key: 'LIVRE',
    label: 'Livre',
    icon: GraduationCap,
    tone: 'from-violet-500 to-fuchsia-500',
    text: 'text-violet-700',
    chip: 'border-violet-100 bg-violet-50 text-violet-700'
  },
  {
    key: 'ESPECIALIZACAO',
    label: 'Especialização',
    icon: BookOpen,
    tone: 'from-emerald-500 to-teal-500',
    text: 'text-emerald-700',
    chip: 'border-emerald-100 bg-emerald-50 text-emerald-700'
  },
  {
    key: 'EAD',
    label: 'EAD',
    icon: MonitorPlay,
    tone: 'from-orange-500 to-rose-500',
    text: 'text-orange-700',
    chip: 'border-orange-100 bg-orange-50 text-orange-700'
  }
];

const fmtNumber = (value: number) => value.toLocaleString('pt-BR');

const GestaoResumo: React.FC<GestaoResumoProps> = ({ poloId }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gestao-resumo-kpis', poloId || 'matriz-global'],
    queryFn: () => gestaoService.getGestaoResumoKpis(poloId),
  });

  return (
    <div className="space-y-6 animate-fadeIn">
      <header className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-[#001a33] via-[#012b57] to-[#014c86] p-6 text-white shadow-sm">
        <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-white/5" />
        <div className="absolute -left-10 bottom-[-2.2rem] h-36 w-36 rounded-full bg-white/10" />
        <div className="relative">
          <p className="mb-2 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.28em] text-blue-100/90">
            <TrendingUp size={14} /> Resumo de gestão
          </p>
          <h2 className="text-3xl font-black uppercase tracking-tight">Visão geral por modalidade</h2>
          <p className="mt-2 max-w-2xl text-sm text-blue-100/90">
            Visão rápida, intuitiva e atualizada para decidir onde ajustar oferta e captação.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-500">
          Carregando resumo da gestão...
        </div>
      ) : isError ? (
        <div className="rounded-[1.8rem] border border-rose-200 bg-rose-50 p-6 text-sm font-bold text-rose-700">
          Não foi possível carregar os indicadores de resumo.
        </div>
      ) : (
        data && (
          <>
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total de turmas</span>
                  <span className="rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-500 p-2.5 text-white shadow-md">
                    <PieChart size={18} />
                  </span>
                </div>
                <p className="mt-4 text-4xl font-black text-[#001a33]">{fmtNumber(data.totalTurmas)}</p>
                <p className="mt-2 text-xs text-slate-500">Consolidação de todas as modalidades.</p>
              </div>

              <div className="rounded-[1.8rem] border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Total de alunos</span>
                  <span className="rounded-2xl bg-gradient-to-br from-indigo-600 to-fuchsia-500 p-2.5 text-white shadow-md">
                    <Users size={18} />
                  </span>
                </div>
                <p className="mt-4 text-4xl font-black text-[#001a33]">{fmtNumber(data.totalAlunos)}</p>
                <p className="mt-2 text-xs text-slate-500">Matrículas totais em todas as turmas.</p>
              </div>
            </section>

            <section className="rounded-[1.8rem] border border-slate-200 bg-white p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Distribuição por modalidade</p>
                  <h3 className="mt-1 text-lg font-black text-[#001a33]">Turmas e alunos em comparação</h3>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-slate-500 hover:bg-slate-50"
                >
                  Detalhar <ArrowRight size={14} />
                </button>
              </div>

              <div className="space-y-4">
                {typeConfig.map((tipo) => {
                  const Icon = tipo.icon;
                  const turmas = data.turmasPorTipo[tipo.key] ?? 0;
                  const alunos = data.alunosPorTipo[tipo.key] ?? 0;
                  const percentTurmas = data.percentTurmasPorTipo[tipo.key] ?? 0;
                  const percentAlunos = data.percentAlunosPorTipo[tipo.key] ?? 0;

                  return (
                    <div key={tipo.key} className="rounded-[1.3rem] border border-slate-100 bg-slate-50 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${tipo.chip}`}>
                          <Icon size={13} />
                          {tipo.label}
                        </span>
                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Alunos: {fmtNumber(alunos)}</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:items-center">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Turmas</p>
                          <p className={`text-2xl font-black ${tipo.text}`}>
                            {fmtNumber(turmas)}
                          </p>
                          <p className="text-xs text-slate-500">{percentTurmas}% do total de turmas</p>
                        </div>
                        <div>
                          <div className="mb-2 flex justify-between text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                            <span>Participação de alunos</span>
                            <span>{percentAlunos}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r ${tipo.tone}`}
                              style={{ width: `${percentAlunos}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-[1.4rem] border border-emerald-100 bg-emerald-50 p-4 text-emerald-800">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Ponto de atenção</p>
                <p className="mt-2 text-sm">Filtre por polo para identificar rapidamente onde há queda de matrículas e concentrar suporte.</p>
              </div>
              <div className="rounded-[1.4rem] border border-blue-100 bg-blue-50 p-4 text-blue-800">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Ação recomendada</p>
                <p className="mt-2 text-sm">Compare modalidades com baixo volume de alunos para ajustar campanha de captação e cronograma de turmas.</p>
              </div>
              <div className="rounded-[1.4rem] border border-violet-100 bg-violet-50 p-4 text-violet-800">
                <p className="text-[10px] font-black uppercase tracking-[0.2em]">Apoio visual</p>
                <p className="mt-2 text-sm">Use a barra de distribuição para identificar qual modalidade está mais concentrada no cenário atual.</p>
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
};

export default GestaoResumo;

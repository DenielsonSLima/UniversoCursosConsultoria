import React from 'react';
import { ArrowRight, CalendarDays, GraduationCap, Library, MapPin, MessageSquare, PlayCircle, ShieldCheck, UserCog } from 'lucide-react';
import { useProfessorDashboardStats } from '../hooks/useProfessorDashboard';

interface InicioPageProps {
  professorId: string;
  professorNome: string;
  poloId?: string | null;
  onNavigate: (module: string) => void;
}

const formatDate = (date?: string | null) => {
  if (!date) return 'Sem data';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
};

const formatDateLong = (date?: string | null) => {
  if (!date) return 'Data a definir';
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
};

const InicioPage: React.FC<InicioPageProps> = ({ professorId, professorNome, poloId, onNavigate }) => {
  const {
    disciplinasCount,
    turmasCount,
    chatsCount,
    meusCursosCount,
    proximasAulas,
    turmas,
  } = useProfessorDashboardStats(professorId, poloId);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner (Vibrant Purple-Petroleum Gradient for Teachers) */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-800 to-[#001a33] text-white rounded-3xl px-6 py-5 md:px-8 md:py-6 shadow-lg">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute right-1/4 -bottom-12 w-60 h-60 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-5xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider text-purple-100 mb-2 border border-white/10">
            <ShieldCheck size={14} className="text-yellow-400" />
            Portal do Docente
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
            Olá, <span className="text-purple-200">{professorNome}</span>!
          </h1>
          <p className="mt-1.5 text-purple-100/90 text-sm md:text-base font-medium max-w-4xl">
            Bem-vindo à sua área docente. Lance notas e frequências, suba arquivos didáticos e responda chamados da instituição.
          </p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* KPI 1 */}
        <button
          onClick={() => onNavigate('turmas')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-purple-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Minhas Disciplinas</p>
            <p className="text-3xl font-black text-[#001a33]">{disciplinasCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Disciplinas atribuídas pela secretaria</p>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <GraduationCap size={22} />
          </div>
        </button>

        {/* KPI 2 */}
        <button
          onClick={() => onNavigate('comunicacao')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-purple-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Mensagens</p>
            <p className="text-3xl font-black text-[#001a33]">{chatsCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Atendimentos ativos abertos</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <MessageSquare size={22} />
          </div>
        </button>

        {/* KPI 3 */}
        <button
          onClick={() => onNavigate('turmas')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-purple-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Turmas</p>
            <p className="text-3xl font-black text-[#001a33]">{turmasCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Turmas vinculadas em andamento</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <CalendarDays size={22} />
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Próximas aulas</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">Datas cadastradas para suas disciplinas no polo selecionado.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('turmas')}
              className="hidden rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-50 md:block"
            >
              Ver disciplinas
            </button>
          </div>

          <div className="space-y-3">
            {proximasAulas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm font-semibold text-slate-500">
                Nenhuma próxima aula com data cadastrada para este professor.
              </div>
            ) : (
              proximasAulas.map((aula) => (
                <div key={aula.id} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-purple-50 text-purple-650">
                    <span className="text-base font-black leading-none">{formatDate(aula.dataAula).slice(0, 2)}</span>
                    <span className="mt-1 text-[9px] font-black uppercase leading-none">{formatDate(aula.dataAula).slice(3)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-black text-[#001a33]">{aula.titulo || aula.disciplinaNome || 'Aula cadastrada'}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-600">{aula.disciplinaNome || 'Disciplina sem nome'}</p>
                    <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                      {aula.turmaNome}{aula.cursoNome ? ` · ${aula.cursoNome}` : ''}
                    </p>
                    <p className="mt-2 flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <MapPin size={12} />
                      {[aula.poloNome, aula.poloCidade && aula.poloUf ? `${aula.poloCidade}/${aula.poloUf}` : aula.poloCidade].filter(Boolean).join(' · ') || 'Polo não informado'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {formatDateLong(aula.dataAula)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Turmas em andamento</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Resumo das turmas vinculadas às suas disciplinas.</p>
          </div>

          <div className="space-y-3">
            {turmas.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm font-semibold text-slate-500">
                Nenhuma turma em andamento vinculada.
              </div>
            ) : (
              turmas.map((turma) => (
                <button
                  key={turma.id}
                  type="button"
                  onClick={() => onNavigate('turmas')}
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50/40 p-4 text-left transition hover:border-purple-100 hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-[#001a33]">{turma.nome}</h3>
                      <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                        {turma.cursoNome || 'Curso não informado'}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                      {turma.disciplinasCount} {turma.disciplinasCount === 1 ? 'disc.' : 'disc.'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                    <span>Início: {turma.dataInicio ? formatDate(turma.dataInicio) : 'a definir'}</span>
                    <span>·</span>
                    <span>Próxima aula: {turma.proximaAula ? formatDate(turma.proximaAula) : 'sem data'}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Acesso rápido</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Atalhos principais da rotina docente.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              id: 'turmas',
              title: 'Disciplinas',
              description: 'Acompanhe turmas, aulas, notas e frequências.',
              icon: <GraduationCap size={18} />,
              color: 'text-purple-650 bg-purple-50',
            },
            {
              id: 'biblioteca',
              title: 'Biblioteca',
              description: 'Publique e consulte materiais didáticos.',
              icon: <Library size={18} />,
              color: 'text-indigo-650 bg-indigo-50',
            },
            {
              id: 'comunicacao',
              title: 'Comunicação',
              description: 'Abra ou responda chamados da coordenação.',
              icon: <MessageSquare size={18} />,
              color: 'text-amber-650 bg-amber-50',
            },
            {
              id: 'perfil',
              title: 'Meu Perfil',
              description: 'Atualize dados, Pix, segurança e Google.',
              icon: <UserCog size={18} />,
              color: 'text-emerald-650 bg-emerald-50',
            },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="group flex min-h-28 items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/40 p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-200 hover:bg-white hover:shadow-sm"
            >
              <div className="min-w-0">
                <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${item.color}`}>
                  {item.icon}
                </div>
                <h3 className="text-sm font-black text-[#001a33]">{item.title}</h3>
                <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">{item.description}</p>
              </div>
              <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-1 group-hover:text-[#001a33]" />
            </button>
          ))}
        </div>
      </div>

      {meusCursosCount > 0 && (
        <div className="rounded-3xl border border-blue-100 bg-blue-50/70 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-600 shadow-sm">
                <PlayCircle size={22} />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Cursos comprados como aluno</h2>
                <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-600">
                  Você possui {meusCursosCount} {meusCursosCount === 1 ? 'curso vinculado' : 'cursos vinculados'} ao acesso de aluno. Para assistir aulas, emitir certificados ou acompanhar o progresso, entre pela área do aluno.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { window.location.href = '/aluno'; }}
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700"
            >
              Acessar área do aluno
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InicioPage;

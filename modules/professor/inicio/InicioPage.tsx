import React from 'react';
import {
  AlertTriangle, CalendarCheck2, CalendarDays, ClipboardList, GraduationCap,
  Library, Loader2, MessageSquare, NotebookPen, PlayCircle, UserCog,
} from 'lucide-react';
import { useProfessorDashboardStats } from '../hooks/useProfessorDashboard';
import { useProfessorHomeRealtime } from './useProfessorHomeRealtime';
import ProfessorHomeLists from './ProfessorHomeLists';
import '../components/professor-screens.css';

interface InicioPageProps {
  professorId: string;
  professorNome: string;
  poloId?: string | null;
  onNavigate: (module: string) => void;
}
interface ActionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}
const RoutineAction: React.FC<ActionProps> = ({ title, description, icon, onClick }) => (
  <button type="button" onClick={onClick} className="professor-card flex items-start gap-3 text-left">
    <span className="mt-0.5 shrink-0 text-blue-600">{icon}</span>
    <div className="min-w-0"><h3>{title}</h3><p className="mt-1 professor-help">{description}</p></div>
  </button>
);
const shortcuts = [
  { id: 'turmas', label: 'Disciplinas', help: 'Turmas, aulas, notas e frequências.', icon: GraduationCap },
  { id: 'biblioteca', label: 'Biblioteca', help: 'Materiais didáticos e arquivos.', icon: Library },
  { id: 'comunicacao', label: 'Comunicação', help: 'Chamados com a coordenação.', icon: MessageSquare },
  { id: 'perfil', label: 'Meu perfil', help: 'Dados, Pix, segurança e Google.', icon: UserCog },
];

const InicioPage: React.FC<InicioPageProps> = ({ professorId, professorNome, poloId, onNavigate }) => {
  const {
    disciplinasCount, turmasCount, chatsCount, meusCursosCount,
    proximasAulas, turmas, isLoading, isError,
  } = useProfessorDashboardStats(professorId, poloId);
  useProfessorHomeRealtime(professorId, poloId);
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const aulasHoje = proximasAulas.filter((aula) => aula.dataAula === today).length;
  const turmasSemProximaAula = turmas.filter((turma) => !turma.proximaAula).length;
  const kpis = [
    { id: 'turmas', label: 'Disciplinas', value: disciplinasCount, help: 'Atribuídas pela secretaria', icon: GraduationCap },
    { id: 'comunicacao', label: 'Mensagens', value: chatsCount, help: 'Atendimentos ativos', icon: MessageSquare },
    { id: 'turmas', label: 'Turmas', value: turmasCount, help: 'Vinculadas em andamento', icon: CalendarDays },
    { id: 'turmas', label: 'Aulas hoje', value: aulasHoje, help: 'Diário, presença e conteúdo', icon: ClipboardList },
  ];

  return (
    <div className="professor-screen space-y-5">
      <header className="professor-heading">
        <div><h2>Olá, {professorNome}!</h2><p>Notas, frequência e planejamento das suas disciplinas.</p></div>
      </header>
      {isLoading ? (
        <p role="status" className="flex items-center gap-2 professor-help">
          <Loader2 size={16} className="animate-spin" />Carregando sua rotina…
        </p>
      ) : isError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
          Não foi possível carregar sua rotina. A consulta será retomada automaticamente ao reconectar.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {kpis.map(({ id, label, value, help, icon: Icon }) => (
              <button key={label} type="button" onClick={() => onNavigate(id)} className="professor-card flex items-start justify-between gap-3 text-left">
                <div className="min-w-0">
                  <p className="professor-help">{label}</p>
                  <p className="mt-1 text-2xl font-semibold text-[#001a33]">{value}</p>
                  <p className="mt-1 professor-help">{help}</p>
                </div>
                <Icon size={19} className="shrink-0 text-blue-600" />
              </button>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <RoutineAction
              title="Lançar presença e notas" icon={<ClipboardList size={22} />}
              description="Abra o diário para registrar frequência e conteúdo ministrado."
              onClick={() => onNavigate('turmas')}
            />
            <RoutineAction
              title="Planejar aulas" icon={<NotebookPen size={22} />}
              description="Organize os conteúdos previstos para cada dia letivo."
              onClick={() => onNavigate('plano-curso')}
            />
            <RoutineAction
              title={`${proximasAulas.length} próximas aulas`} icon={<CalendarCheck2 size={22} />}
              description="Confira as datas por disciplina e turma na agenda."
              onClick={() => onNavigate('calendario')}
            />
          </div>
          {turmasSemProximaAula > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              <p>{turmasSemProximaAula} turma(s) sem próxima aula. Confira diário, calendário e planejamento com a coordenação.</p>
            </div>
          )}
          <ProfessorHomeLists lessons={proximasAulas} classes={turmas} onOpenClasses={() => onNavigate('turmas')} />
        </>
      )}
      <section className="professor-card">
        <div className="professor-heading"><h3>Acesso rápido</h3></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {shortcuts.map(({ id, label, help, icon: Icon }) => (
            <button key={id} type="button" onClick={() => onNavigate(id)} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-left">
              <Icon size={18} className="mt-0.5 shrink-0 text-blue-600" />
              <div><h4>{label}</h4><p className="mt-1 professor-help">{help}</p></div>
            </button>
          ))}
        </div>
      </section>
      {meusCursosCount > 0 && (
        <section className="professor-card flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2"><PlayCircle size={18} />Cursos comprados como aluno</h3>
            <p className="mt-1 professor-help">Você possui {meusCursosCount} curso(s) vinculado(s) ao acesso de aluno. Aulas, certificados e progresso ficam na área do aluno.</p>
          </div>
          <a href="/aluno" className="professor-button">Acessar área do aluno</a>
        </section>
      )}
    </div>
  );
};
export default InicioPage;

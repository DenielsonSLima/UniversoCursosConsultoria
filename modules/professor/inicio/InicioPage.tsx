import React from 'react';
import { GraduationCap, Calendar, MessageSquare, Megaphone, Award, ShieldCheck, PlayCircle } from 'lucide-react';
import { useProfessorDashboardStats } from '../hooks/useProfessorDashboard';

interface InicioPageProps {
  professorId: string;
  professorNome: string;
  onNavigate: (module: string) => void;
}

const InicioPage: React.FC<InicioPageProps> = ({ professorId, professorNome, onNavigate }) => {
  const { disciplinasCount, chatsCount, meusCursosCount } = useProfessorDashboardStats(professorId);

  const avisos = [
    {
      id: 1,
      titulo: 'Fechamento do Diário Acadêmico 2026.1',
      conteudo: 'Atenção professores! O prazo final para lançamento de notas e frequências regulares do primeiro semestre se encerra em 10/07. Por favor, evitem atrasos.',
      data: '20/06/2026',
      categoria: 'Secretaria',
      importante: true
    },
    {
      id: 2,
      titulo: 'Encontro Pedagógico Geral',
      conteudo: 'Convocamos todo o corpo docente para o Encontro Pedagógico do polo, a realizar-se no dia 28/06 para alinhamento dos novos estágios.',
      data: '19/06/2026',
      categoria: 'Pedagógico',
      importante: false
    }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner (Vibrant Purple-Petroleum Gradient for Teachers) */}
      <div className="relative overflow-hidden bg-gradient-to-r from-purple-600 via-indigo-800 to-[#001a33] text-white rounded-[2.5rem] p-8 md:p-10 shadow-lg">
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute right-1/4 -bottom-12 w-60 h-60 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-purple-100 mb-4 border border-white/10">
            <ShieldCheck size={14} className="text-yellow-400" />
            Portal do Docente
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Olá, <span className="text-purple-200">{professorNome}</span>!
          </h1>
          <p className="mt-2 text-purple-100/90 text-sm md:text-base font-medium max-w-md">
            Bem-vindo à sua área docente. Lance notas e frequências, suba arquivos didáticos e responda chamados da instituição.
          </p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
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
          onClick={() => onNavigate('meus-cursos')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Meus Cursos</p>
            <p className="text-3xl font-black text-[#001a33]">{meusCursosCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Cursos comprados como aluno</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <PlayCircle size={22} />
          </div>
        </button>

        {/* KPI 3 */}
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

        {/* KPI 4 */}
        <button
          onClick={() => onNavigate('perfil')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-purple-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Financeiro</p>
            <p className="text-3xl font-black text-[#001a33]">Pix</p>
            <p className="text-[10px] text-slate-500 font-medium">Dados bancários homologados</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Award size={22} />
          </div>
        </button>
      </div>

      {/* Announcements & Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
              <Megaphone size={16} />
            </div>
            <h2 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Comunicados de Coordenação</h2>
          </div>

          <div className="space-y-4">
            {avisos.map(aviso => (
              <div key={aviso.id} className={`p-5 rounded-2xl border transition-all ${
                aviso.importante 
                  ? 'border-red-100 bg-red-50/20 hover:bg-red-50/40' 
                  : 'border-slate-100 bg-slate-50/30 hover:bg-slate-50/60'
              }`}>
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#001a33]">{aviso.titulo}</h3>
                    {aviso.importante && (
                      <span className="bg-red-100 text-red-700 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded">Urgente</span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">{aviso.data}</span>
                </div>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">{aviso.conteudo}</p>
                <div className="mt-3 flex items-center gap-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-white border border-slate-150 px-2 py-0.5 rounded-full">{aviso.categoria}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Calendar Column */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Calendar size={16} />
              </div>
              <h3 className="font-bold text-sm text-[#001a33] uppercase tracking-tight">Agenda Docente</h3>
            </div>
            
            <div className="space-y-4.5">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] uppercase font-black">Jun</span>
                  <span className="text-sm font-black -mt-1">28</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#001a33]">Encontro de Docentes</h4>
                  <p className="text-[10px] text-slate-450 font-medium">15:00 - Sala de Reunião 2</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] uppercase font-black">Jul</span>
                  <span className="text-sm font-black -mt-1">05</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#001a33]">Lançamento de Notas Parciais</h4>
                  <p className="text-[10px] text-slate-450 font-medium">Sistema acadêmico virtual</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 shadow-md relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-purple-650/30 rounded-full blur-xl"></div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-purple-300">Chamado Rápido</h3>
            <p className="text-[11px] text-slate-350 font-medium mt-1">
              Abra uma solicitação direta para a coordenação para ajustes na grade ou solicitações de compras de insumos.
            </p>
            <button 
              onClick={() => onNavigate('comunicacao')}
              className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-550 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all w-full text-center"
            >
              Falar com Coordenação
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InicioPage;

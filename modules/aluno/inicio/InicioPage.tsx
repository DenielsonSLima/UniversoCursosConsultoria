import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { BookOpen, GraduationCap, Bell, MessageSquare, Megaphone, Calendar, Award } from 'lucide-react';

interface InicioPageProps {
  alunoId: string;
  alunoNome: string;
  onNavigate: (module: string) => void;
}

const InicioPage: React.FC<InicioPageProps> = ({ alunoId, alunoNome, onNavigate }) => {
  // Query to count enrolled classes
  const { data: matriculasCount = 0 } = useQuery({
    queryKey: ['aluno-matriculas-count', alunoId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('matriculas')
        .select('*', { count: 'exact', head: true })
        .eq('aluno_id', alunoId);
      
      if (error) throw error;
      return count || 0;
    }
  });

  // Query to count available library files
  const { data: bibliotecaCount = 0 } = useQuery({
    queryKey: ['aluno-biblioteca-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('biblioteca_documentos')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    }
  });

  // Query to count open chats
  const { data: chatsCount = 0 } = useQuery({
    queryKey: ['aluno-chats-count', alunoId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('comunicacao_chats')
        .select('*', { count: 'exact', head: true })
        .eq('remetente_id', alunoId)
        .eq('status', 'pendente');
      
      if (error) throw error;
      return count || 0;
    }
  });

  const avisos = [
    {
      id: 1,
      titulo: 'Rematrícula Segundo Semestre de 2026',
      conteudo: 'Atenção alunos! O prazo de rematrícula para o próximo período letivo começa no dia 01/07. Fique atento a pendências financeiras.',
      data: '20/06/2026',
      categoria: 'Secretaria',
      importante: true
    },
    {
      id: 2,
      titulo: 'Novos Livros e Apostilas na Biblioteca',
      conteudo: 'A coordenação pedagógica liberou novas apostilas técnicas de Radiologia e Enfermagem no módulo Biblioteca.',
      data: '18/06/2026',
      categoria: 'Pedagógico',
      importante: false
    },
    {
      id: 3,
      titulo: 'Ajuste de Horários das Aulas Práticas',
      conteudo: 'Consulte o calendário letivo no mural do polo para verificar as novas datas das aulas práticas de estágio supervisionado.',
      data: '15/06/2026',
      categoria: 'Aviso Geral',
      importante: false
    }
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Welcome Banner (Premium Gradient) */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-700 to-[#001a33] text-white rounded-[2.5rem] p-8 md:p-10 shadow-lg">
        {/* Decorative backdrop shapes */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute right-1/4 -bottom-12 w-60 h-60 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-wider text-blue-100 mb-4 border border-white/10">
            <Award size={14} className="text-yellow-400" />
            Portal Acadêmico
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-tight">
            Olá, <span className="text-blue-200">{alunoNome}</span>!
          </h1>
          <p className="mt-2 text-blue-100/90 text-sm md:text-base font-medium max-w-md">
            Bem-vindo ao seu ambiente virtual de aprendizagem. Acompanhe seus estudos, financeiro, biblioteca e chamados de suporte.
          </p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* KPI 1 */}
        <button
          onClick={() => onNavigate('turmas')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Minhas Turmas</p>
            <p className="text-3xl font-black text-[#001a33]">{matriculasCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Turmas e estágios vinculados</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <GraduationCap size={22} />
          </div>
        </button>

        {/* KPI 2 */}
        <button
          onClick={() => onNavigate('biblioteca')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Biblioteca</p>
            <p className="text-3xl font-black text-[#001a33]">{bibliotecaCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Documentos e apostilas liberados</p>
          </div>
          <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <BookOpen size={22} />
          </div>
        </button>

        {/* KPI 3 */}
        <button
          onClick={() => onNavigate('comunicacao')}
          className="flex items-center justify-between p-6 bg-white border border-slate-100 hover:border-blue-500 rounded-3xl shadow-sm text-left transition-all hover:-translate-y-1 group"
        >
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Suporte</p>
            <p className="text-3xl font-black text-[#001a33]">{chatsCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Chamados ativos abertos</p>
          </div>
          <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <MessageSquare size={22} />
          </div>
        </button>
      </div>

      {/* Main Content Grid: Announcements & Calendar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Announcements List */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <Megaphone size={16} />
            </div>
            <h2 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Comunicados Importantes</h2>
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

        {/* Dynamic Sidebar Info (Calendar & Fast Access) */}
        <div className="space-y-6">
          {/* Quick Schedule card */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Calendar size={16} />
              </div>
              <h3 className="font-bold text-sm text-[#001a33] uppercase tracking-tight">Próximos Eventos</h3>
            </div>
            
            <div className="space-y-4.5">
              <div className="flex gap-3">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] uppercase font-black">Jun</span>
                  <span className="text-sm font-black -mt-1">26</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#001a33]">Aula Prática: Enfermagem</h4>
                  <p className="text-[10px] text-slate-450 font-medium">19:00 - Polo Aracaju</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] uppercase font-black">Jul</span>
                  <span className="text-sm font-black -mt-1">10</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#001a33]">Entrega Relatório Estágio</h4>
                  <p className="text-[10px] text-slate-450 font-medium">Prazo limite pelo Portal</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex flex-col items-center justify-center shrink-0">
                  <span className="text-[8px] uppercase font-black">Jul</span>
                  <span className="text-sm font-black -mt-1">15</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#001a33]">Fim das Provas Regulares</h4>
                  <p className="text-[10px] text-slate-450 font-medium">Semestre Acadêmico 2026.1</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Access Portal rules */}
          <div className="bg-slate-900 text-white rounded-[2.5rem] p-6 shadow-md relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-blue-600/30 rounded-full blur-xl"></div>
            <h3 className="font-bold text-sm uppercase tracking-wider text-blue-300">Central de Atendimento</h3>
            <p className="text-[11px] text-slate-350 font-medium mt-1">
              Tem alguma dúvida sobre notas, mensalidades ou documentação?
            </p>
            <button 
              onClick={() => onNavigate('comunicacao')}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all w-full text-center"
            >
              Falar com Atendente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InicioPage;

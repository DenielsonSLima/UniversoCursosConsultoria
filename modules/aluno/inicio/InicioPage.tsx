import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { BookOpen, GraduationCap, MessageSquare, Megaphone, Calendar, Award, MapPin, CreditCard, AlertTriangle, CheckCircle2, WalletCards } from 'lucide-react';
import { canAccessLibraryDocumentAsAluno } from '../biblioteca/libraryAccess';

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
        .eq('aluno_id', alunoId)
        .in('status', ['ATIVO', 'CONCLUIDO']);
      
      if (error) throw error;
      return count || 0;
    }
  });

  // 2. Informações de matrícula para contexto de acesso
  const { data: matriculas = [], isLoading: loadingMatriculas } = useQuery<any[]>({
    queryKey: ['aluno-inicio-matriculas', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId)
        .in('status', ['ATIVO', 'CONCLUIDO']);
      if (error) throw error;
      return data || [];
    }
  });

  const activeTurmaIds = matriculas.map((m) => m.turma_id).filter(Boolean);
  const activeCursoIds = Array.from(new Set(matriculas.map((m) => m.turmas?.cursos?.id).filter(Boolean)));
  const activePoloIds = Array.from(new Set(matriculas.map((m) => m.polo_id).filter(Boolean)));

  const { data: activeTeachers = [] } = useQuery<any[]>({
    queryKey: ['aluno-inicio-professores', activeTurmaIds.join(',')],
    queryFn: async () => {
      if (activeTurmaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select('professor_id')
        .in('turma_id', activeTurmaIds);
      if (error) throw error;
      return data || [];
    },
    enabled: matriculas.length > 0
  });

  const { data: turmaDisciplinas = [] } = useQuery<any[]>({
    queryKey: ['aluno-inicio-turma-disciplinas', activeTurmaIds.join(',')],
    queryFn: async () => {
      if (activeTurmaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select('turma_id, disciplina_id, created_at')
        .in('turma_id', activeTurmaIds);
      if (error) throw error;
      return data || [];
    },
    enabled: activeTurmaIds.length > 0
  });

  const activeTeacherIds = Array.from(new Set(activeTeachers.map((item) => item.professor_id).filter(Boolean)));

  const accessContext = {
    activeTurmaIds,
    activeCursoIds,
    activePoloIds,
    activeTeacherIds,
    turmaDisciplinas
  };

  // 3. Count de documentos realmente disponíveis ao aluno no contexto atual
  const { data: bibliotecaCount = 0 } = useQuery<number>({
    queryKey: [
      'aluno-biblioteca-count',
      alunoId,
      activeTurmaIds.join(','),
      activeCursoIds.join(','),
      activePoloIds.join(','),
      activeTeacherIds.join(',')
    ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('biblioteca_documentos')
        .select('*');

      if (error) throw error;

      return (data || []).filter((doc) => canAccessLibraryDocumentAsAluno(doc, accessContext)).length;
    },
    enabled: !loadingMatriculas
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

  const { data: financeiroResumo, isLoading: loadingFinanceiro } = useQuery<any>({
    queryKey: ['aluno-inicio-financeiro-resumo', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(`
          id,
          descricao,
          valor,
          status,
          data_vencimento,
          asaas_invoice_url,
          turmas!left(nome, cursos!left(nome, modalidade))
        `)
        .eq('cliente_id', alunoId)
        .not('status', 'in', '("CANCELADO","ESTORNADO")')
        .order('data_vencimento', { ascending: true });

      if (error) throw error;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const openItems = (data || []).filter((item) => ['PENDENTE', 'VENCIDO'].includes(String(item.status || '').toUpperCase()));
      const overdueItems = openItems.filter((item) => {
        const due = item.data_vencimento ? new Date(`${item.data_vencimento}T00:00:00`) : null;
        return String(item.status || '').toUpperCase() === 'VENCIDO' || (due && due < today);
      });
      const nextPayment = openItems.find((item) => {
        const due = item.data_vencimento ? new Date(`${item.data_vencimento}T00:00:00`) : null;
        return due && due >= today;
      }) || openItems[0] || null;

      return {
        nextPayment,
        overdueCount: overdueItems.length,
        overdueTotal: overdueItems.reduce((sum, item) => sum + Number(item.valor || 0), 0),
        openTotal: openItems.reduce((sum, item) => sum + Number(item.valor || 0), 0),
      };
    }
  });

  const { data: turmasAbertas = [], isLoading: loadingTurmasAbertas } = useQuery<any[]>({
    queryKey: ['aluno-inicio-turmas-abertas-online'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('turmas')
        .select(`
          id,
          nome,
          data_inicio,
          data_inicio_inscricao,
          data_fim_inscricao,
          cursos!inner(id, nome, modalidade, area, imagem_url, status, publicar_site),
          polos(nome, cidade, estado)
        `)
        .eq('status', 'EM_ANDAMENTO')
        .eq('permitir_inscricoes_online', true)
        .in('cursos.modalidade', ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'])
        .eq('cursos.status', 'ativo')
        .eq('cursos.publicar_site', true)
        .or(`data_inicio_inscricao.is.null,data_inicio_inscricao.lte.${today}`)
        .or(`data_fim_inscricao.is.null,data_fim_inscricao.gte.${today}`)
        .order('data_inicio', { ascending: true })
        .limit(8);

      if (error) throw error;
      return data || [];
    }
  });

  const getPoloLabel = (turma: any) => {
    const polo = Array.isArray(turma?.polos) ? turma.polos[0] : turma?.polos;
    return [polo?.nome, polo?.cidade && polo?.estado ? `${polo.cidade}/${polo.estado}` : polo?.cidade || polo?.estado]
      .filter(Boolean)
      .join(' - ') || 'Polo a confirmar';
  };

  const formatCurrency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Sem vencimento';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

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
            Olá! Acompanhe estudos, financeiro, biblioteca e suporte em um só lugar.
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
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Meus Cursos</p>
            <p className="text-3xl font-black text-[#001a33]">{matriculasCount}</p>
            <p className="text-[10px] text-slate-500 font-medium">Cursos matriculados e liberados</p>
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

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <button
          type="button"
          onClick={() => onNavigate('financeiro')}
          className="rounded-[2rem] border border-slate-100 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                financeiroResumo?.overdueCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'
              }`}>
                {financeiroResumo?.overdueCount > 0 ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">Financeiro</p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-[#001a33]">
                  {loadingFinanceiro
                    ? 'Carregando situação...'
                    : financeiroResumo?.overdueCount > 0
                      ? `${financeiroResumo.overdueCount} pagamento(s) em atraso`
                      : 'Você está em dia'}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {financeiroResumo?.nextPayment
                    ? `Próximo vencimento: ${formatDate(financeiroResumo.nextPayment.data_vencimento)}`
                    : 'Nenhuma cobrança aberta encontrada.'}
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 md:min-w-48">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Aberto agora</p>
              <p className="mt-1 text-2xl font-black text-[#001a33]">{formatCurrency(financeiroResumo?.openTotal || 0)}</p>
              <p className="mt-1 text-[10px] font-bold text-rose-500">Atrasado: {formatCurrency(financeiroResumo?.overdueTotal || 0)}</p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('financeiro')}
          className="rounded-[2rem] border border-slate-100 bg-[#001a33] p-6 text-left text-white shadow-sm transition hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-blue-200">
              <WalletCards size={21} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">Próximo pagamento</p>
              <h3 className="mt-1 text-lg font-black">
                {financeiroResumo?.nextPayment ? formatCurrency(Number(financeiroResumo.nextPayment.valor || 0)) : 'Sem cobrança aberta'}
              </h3>
            </div>
          </div>
          <p className="mt-4 line-clamp-2 text-xs font-semibold leading-relaxed text-slate-300">
            {financeiroResumo?.nextPayment?.descricao || 'Quando houver mensalidade, boleto ou PIX pendente, ele aparecerá aqui para facilitar o acompanhamento.'}
          </p>
        </button>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-600">Matrículas online</p>
            <h2 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Turmas em aberto</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('cursos')}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-100 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-blue-700 hover:border-blue-300"
          >
            <BookOpen size={14} />
            Ver todos
          </button>
        </div>

        {loadingTurmasAbertas ? (
          <div className="rounded-[2rem] border border-slate-100 bg-white p-6 text-xs font-bold text-slate-400 shadow-sm">
            Carregando turmas abertas...
          </div>
        ) : turmasAbertas.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {turmasAbertas.map((turma) => {
              const curso = Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos;
              return (
                <button
                  key={turma.id}
                  type="button"
                  onClick={() => onNavigate('cursos')}
                  className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white text-left shadow-sm transition-all hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
                >
                  <div className="h-32 bg-slate-100">
                    {curso?.imagem_url ? (
                      <img src={curso.imagem_url} alt={curso.nome} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-blue-300">
                        <BookOpen size={34} />
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-blue-700">
                      {curso?.modalidade || 'Curso'}
                    </span>
                    <div>
                      <h3 className="line-clamp-2 text-sm font-black leading-tight text-[#001a33]">{curso?.nome}</h3>
                      <p className="mt-1 text-[10px] font-bold text-slate-400">{turma.nome || 'Turma aberta'}</p>
                    </div>
                    <p className="flex items-start gap-1.5 text-[11px] font-bold leading-relaxed text-slate-600">
                      <MapPin size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                      {getPoloLabel(turma)}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                      <CreditCard size={13} />
                      Matricular e pagar
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm">
            <BookOpen size={24} className="mx-auto mb-3 text-slate-300" />
            <p className="text-xs font-black text-[#001a33]">Nenhuma turma aberta para matrícula online agora</p>
            <p className="mt-1 text-[10px] font-bold text-slate-400">Quando a secretaria liberar novas turmas, elas aparecerão aqui por polo.</p>
          </div>
        )}
      </section>

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

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
            <Megaphone size={24} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-black text-[#001a33]">Nenhum comunicado publicado</p>
            <p className="mt-1 text-xs font-bold text-slate-400">
              Quando a secretaria publicar avisos reais, eles aparecerão aqui.
            </p>
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
            
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
              <Calendar size={22} className="mx-auto mb-3 text-slate-300" />
              <p className="text-xs font-black text-[#001a33]">Nenhum evento publicado</p>
              <p className="mt-1 text-[10px] font-bold text-slate-400">Eventos reais serão exibidos quando cadastrados.</p>
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

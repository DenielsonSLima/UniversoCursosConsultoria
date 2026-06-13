
// File: modules/gestor/parceiros/ParceirosPage.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, LayoutGrid, Users, GraduationCap, Sparkles, X, Building, User, Download, BookOpen, CheckCircle2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import ParceirosKpis from './components/ParceirosKpis';
import ParceirosFilters from './components/ParceirosFilters';
import ParceirosList from './components/ParceirosList';
import ParceiroAlunoForm from './components/formularioparceiros/aluno/ParceiroAlunoForm';
import ParceiroProfessorForm from './components/formularioparceiros/professor/ParceiroProfessorForm';
import ParceiroPFForm from './components/formularioparceiros/pf/ParceiroPFForm';
import ParceiroPJForm from './components/formularioparceiros/pj/ParceiroPJForm';
import ParceiroAlunoDetalhes from './components/viewparceiros/aluno/ParceiroAlunoDetalhes';
import ParceiroProfessorDetalhes from './components/viewparceiros/professor/ParceiroProfessorDetalhes';
import ParceiroPJDetalhes from './components/viewparceiros/pj/ParceiroPJDetalhes';
import ParceiroPFDetalhes from './components/viewparceiros/pf/ParceiroPFDetalhes';
import ParceirosExportModal from './components/export/ParceirosExportModal';
import { parceirosService } from './parceiros.service';

type TabType = 'todos' | 'professores' | 'alunos' | 'pj' | 'pf';

interface ParceirosPageProps {
  activeTabInicial?: TabType;
}

const ParceirosPage: React.FC<ParceirosPageProps> = ({ activeTabInicial = 'todos' }) => {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState<'aluno' | 'professor' | 'selection' | 'pf' | 'pj' | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>(activeTabInicial);

  React.useEffect(() => {
    setActiveTab(activeTabInicial);
  }, [activeTabInicial]);
  const [selectedParceiro, setSelectedParceiro] = useState<any | null>(null);
  
  // States for Direct Enrollment
  const [createdAlunoNome, setCreatedAlunoNome] = useState('');
  const [showEnrollmentModalForAlunoId, setShowEnrollmentModalForAlunoId] = useState<string | null>(null);
  const [selectedTurmaIdForEnrollment, setSelectedTurmaIdForEnrollment] = useState('');

  // 1. Carregar todos os parceiros
  const { data: allPartners = [], isLoading: loadingPartners } = useQuery<any[]>({
    queryKey: ['parceiros', 'todos'],
    queryFn: () => parceirosService.getAll('todos'),
  });

  // 2. Carregar Turmas Disponíveis com React Query
  const { data: turmasDisponiveis = [] } = useQuery({
    queryKey: ['turmas_disponiveis'],
    queryFn: parceirosService.getTurmasDisponiveis,
    enabled: !!showEnrollmentModalForAlunoId,
  });

  // 3. Realtime para sincronização automática
  useEffect(() => {
    const channel = supabase
      .channel('parceiros_realtime_global')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parceiros' },
        (payload) => {
          console.log('[Realtime] Alteração detectada em parceiros, invalidando queries...', payload);
          queryClient.invalidateQueries({ queryKey: ['parceiros'] });
          queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
          
          const changedId = (payload.new as any)?.id || (payload.old as any)?.id;
          if (changedId) {
            queryClient.invalidateQueries({ queryKey: ['parceiro', changedId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Mutations para criação e matrículas
  const saveAlunoMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'Aluno' }),
    onSuccess: (created, data) => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
      if (data.matricularAgora) {
        setCreatedAlunoNome(created.nome);
        setShowEnrollmentModalForAlunoId(created.id);
      } else {
        alert('Aluno cadastrado com sucesso!');
      }
      setShowForm(null);
    },
    onError: (err: any) => {
      alert('Erro ao salvar aluno. Verifique se o CPF já está cadastrado.');
      console.error(err);
    }
  });

  const saveProfessorMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'Professor' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
      alert('Professor cadastrado com sucesso!');
      setShowForm(null);
    },
    onError: (err: any) => {
      alert('Erro ao salvar professor. Verifique se o CPF já está cadastrado.');
      console.error(err);
    }
  });

  const savePFMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'PF' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
      alert('Parceiro Pessoa Física cadastrado com sucesso!');
      setShowForm(null);
    },
    onError: (err: any) => {
      alert('Erro ao salvar parceiro Pessoa Física.');
      console.error(err);
    }
  });

  const savePJMutation = useMutation({
    mutationFn: (data: any) => parceirosService.create({ ...data, tipo: 'PJ' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros_kpis'] });
      alert('Parceiro Pessoa Jurídica cadastrado com sucesso!');
      setShowForm(null);
    },
    onError: (err: any) => {
      alert('Erro ao salvar parceiro Pessoa Jurídica.');
      console.error(err);
    }
  });

  const enrollAlunoMutation = useMutation({
    mutationFn: ({ alunoId, turmaId }: { alunoId: string, turmaId: string }) =>
      parceirosService.matricularAluno(alunoId, turmaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matriculas'] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      setShowEnrollmentModalForAlunoId(null);
      setSelectedTurmaIdForEnrollment('');
      alert('Matrícula efetuada com sucesso!');
    },
    onError: (err: any) => {
      alert('Erro ao realizar matrícula.');
      console.error(err);
    }
  });

  const handleSaveAluno = async (data: any) => {
    saveAlunoMutation.mutate(data);
  };

  const handleSaveProfessor = async (data: any) => {
    saveProfessorMutation.mutate(data);
  };

  const handleSavePF = async (data: any) => {
    savePFMutation.mutate(data);
  };

  const handleSavePJ = async (data: any) => {
    savePJMutation.mutate(data);
  };

  // States for filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [cursoFilter, setCursoFilter] = useState('todos');
  const [turmaFilter, setTurmaFilter] = useState('todas');
  const [sortOrder, setSortOrder] = useState('az');

  // Filtros e Pesquisa locais para resposta em tempo real e cálculo dinâmico de KPIs
  const filteredPartners = useMemo(() => {
    return allPartners.filter(item => {
      // Filtro de Aba (Tipo)
      if (activeTab !== 'todos') {
        let expectedTipo = '';
        if (activeTab === 'professores') expectedTipo = 'Professor';
        else if (activeTab === 'alunos') expectedTipo = 'Aluno';
        else if (activeTab === 'pj') expectedTipo = 'PJ';
        else if (activeTab === 'pf') expectedTipo = 'PF';
        
        if (item.tipo !== expectedTipo) return false;
      }

      // Filtro de Status (Case Insensitive)
      if (statusFilter !== 'todos' && item.status?.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }

      // Filtro de Busca (Nome, CPF, CNPJ, Cidade)
      if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        const contentStr = `${item.nome} ${item.cpf || ''} ${item.cnpj || ''} ${item.cidade || ''}`.toLowerCase();
        if (!contentStr.includes(lowerTerm)) {
          return false;
        }
      }

      // Filtro de Curso
      if (cursoFilter !== 'todos') {
        if (item.tipo !== 'Aluno' && item.tipo !== 'Professor') {
          return false;
        }
        if (item.cursoId !== cursoFilter) {
          return false;
        }
      }

      // Filtro de Turma
      if (turmaFilter !== 'todas') {
        if (item.tipo !== 'Aluno' && item.tipo !== 'Professor') {
          return false;
        }
        if (item.turmaId !== turmaFilter) {
          return false;
        }
      }

      return true;
    });
  }, [allPartners, activeTab, searchTerm, statusFilter, cursoFilter, turmaFilter]);

  // Ordenação
  const sortedAndFilteredPartners = useMemo(() => {
    const sorted = [...filteredPartners];
    if (sortOrder === 'az') {
      sorted.sort((a, b) => a.nome.localeCompare(b.nome));
    } else if (sortOrder === 'za') {
      sorted.sort((a, b) => b.nome.localeCompare(a.nome));
    } else if (sortOrder === 'recent') {
      sorted.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
    } else if (sortOrder === 'oldest') {
      sorted.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    }
    return sorted;
  }, [filteredPartners, sortOrder]);

  // Calcular KPIs dinamicamente com base nos parceiros filtrados
  const kpis = useMemo(() => {
    const totalParceiros = filteredPartners.length;
    const totalParceirosAtivos = filteredPartners.filter(p => p.status?.toLowerCase() === 'ativo').length;
    
    const alunos = filteredPartners.filter(p => p.tipo === 'Aluno');
    const totalAlunosVinculados = alunos.length;
    const totalAlunosAtivos = alunos.filter(p => p.status?.toLowerCase() === 'ativo').length;
    const totalAlunosInativos = alunos.filter(p => ['inativo', 'cancelado', 'desistente'].includes(p.status?.toLowerCase() || '')).length;
    
    const professores = filteredPartners.filter(p => p.tipo === 'Professor');
    const totalProfessoresVinculados = professores.length;
    const totalProfessoresAtivos = professores.filter(p => p.status?.toLowerCase() === 'ativo').length;
    const totalProfessoresInativos = professores.filter(p => p.status?.toLowerCase() === 'inativo').length;

    return {
      totalParceiros,
      totalParceirosAtivos,
      totalAlunosVinculados,
      totalAlunosAtivos,
      totalAlunosInativos,
      totalProfessoresVinculados,
      totalProfessoresAtivos,
      totalProfessoresInativos
    };
  }, [filteredPartners]);

  // Função mock para busca
  const handleSearch = (term: string) => {
    setSearchTerm(term);
  };

  // Função mock para ordenação
  const handleSort = (sort: string) => {
    setSortOrder(sort);
  };

  const handleAddClick = () => {
    setShowForm('selection');
  };

  // Se um parceiro foi selecionado na lista, mostra os detalhes
  if (selectedParceiro) {
    const handleBackFromDetails = () => {
      setSelectedParceiro(null);
    };

    if (selectedParceiro.tipo === 'Aluno') {
      return <ParceiroAlunoDetalhes alunoInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
    if (selectedParceiro.tipo === 'Professor') {
      return <ParceiroProfessorDetalhes professorInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
    if (selectedParceiro.tipo === 'PJ') {
      return <ParceiroPJDetalhes pjInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
    if (selectedParceiro.tipo === 'PF' || !selectedParceiro.tipo) {
      return <ParceiroPFDetalhes pfInicial={selectedParceiro} onBack={handleBackFromDetails} />;
    }
  }

  // Renderiza o Modal de Seleção
  if (showForm === 'selection') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001a33]/60 backdrop-blur-sm animate-fadeIn">
        <div className="relative bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl border border-slate-100">
          <button 
            onClick={() => setShowForm(null)}
            className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
          >
            <X size={24} />
          </button>

          <div className="text-center mb-10 mt-2">
            <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Novo Registro</h3>
            <p className="text-slate-500 font-medium">Selecione o tipo de cadastro que deseja realizar.</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <button 
              onClick={() => setShowForm('aluno')}
              className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <GraduationCap size={32} />
              </div>
              <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-blue-700 text-center">Aluno</span>
              <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Vínculo de matrícula</span>
            </button>

            <button 
              onClick={() => setShowForm('professor')}
              className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-purple-500 hover:bg-purple-50 transition-all duration-300"
            >
              <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <Users size={32} />
              </div>
              <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-purple-700 text-center">Professor</span>
              <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Vínculo docente</span>
            </button>

            <button 
              onClick={() => setShowForm('pj')}
              className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-slate-800 hover:bg-slate-50 transition-all duration-300"
            >
              <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <Building size={32} />
              </div>
              <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-slate-900 text-center">Pess. Jurídica</span>
              <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Empresas e filiais</span>
            </button>

            <button 
              onClick={() => setShowForm('pf')}
              className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-amber-500 hover:bg-amber-50 transition-all duration-300"
            >
              <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
                <User size={32} />
              </div>
              <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-amber-700 text-center">Pess. Física</span>
              <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Prestad. de Serviço</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showForm === 'aluno') {
    return (
      <div className="animate-fadeIn">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-4xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-600 to-[#001a33]"></div>
          <ParceiroAlunoForm 
            onCancel={() => setShowForm(null)} 
            onSave={handleSaveAluno} 
          />
        </div>
      </div>
    );
  }

  if (showForm === 'professor') {
    return (
      <div className="animate-fadeIn">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-4xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-600 to-[#001a33]"></div>
          <ParceiroProfessorForm 
            onCancel={() => setShowForm(null)} 
            onSave={handleSaveProfessor}
          />
        </div>
      </div>
    );
  }

  if (showForm === 'pf') {
    return (
      <div className="animate-fadeIn">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-4xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-amber-600 to-[#001a33]"></div>
          <ParceiroPFForm 
            onCancel={() => setShowForm(null)} 
            onSave={handleSavePF}
          />
        </div>
      </div>
    );
  }

  if (showForm === 'pj') {
    return (
      <div className="animate-fadeIn">
        <div className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 max-w-4xl mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-slate-900 to-[#001a33]"></div>
          <ParceiroPJForm 
            onCancel={() => setShowForm(null)} 
            onSave={handleSavePJ}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn pb-12">
      
      {/* Header da Página com Design Elevado */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} className="text-[#4169E1]" />
            <span className="text-xs font-bold text-[#4169E1] uppercase tracking-[0.2em]">Módulo Gestão</span>
          </div>
          <h2 className="text-4xl font-black text-[#001a33] uppercase tracking-tighter">
            Parceiros & <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#4169E1] to-[#003366]">Convênios</span>
          </h2>
          <p className="text-slate-500 font-medium mt-2 max-w-lg">
            Administre prefeituras, empresas e as conexões acadêmicas da instituição em um único lugar.
          </p>
        </div>
        
        {/* Botão de Ação Primária */}
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-white text-slate-700 px-6 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs hover:bg-slate-50 hover:text-blue-600 transition-all border border-slate-200 shadow-sm"
          >
            <Download size={16} />
            Exportar
          </button>
          
          <button 
            onClick={handleAddClick}
            className="group relative flex-1 md:flex-none px-6 md:px-8 py-4 bg-[#001a33] text-white rounded-2xl font-bold uppercase tracking-widest text-xs overflow-hidden shadow-xl hover:shadow-2xl hover:shadow-blue-900/20 transition-all hover:-translate-y-1"
          >
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-blue-600 to-[#001a33] opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center justify-center gap-3">
              <div className="bg-white/20 p-1.5 rounded-lg">
                <Plus size={16} />
              </div>
              <span>Novo Registro</span>
            </div>
          </button>
        </div>
      </div>

      <ParceirosKpis 
        totalParceiros={kpis.totalParceiros || 0} 
        totalParceirosAtivos={kpis.totalParceirosAtivos || 0} 
        totalAlunos={kpis.totalAlunosVinculados || 0} 
        totalAlunosAtivos={kpis.totalAlunosAtivos || 0} 
        totalAlunosInativos={kpis.totalAlunosInativos || 0} 
        totalProfessores={kpis.totalProfessoresVinculados || 0} 
        totalProfessoresAtivos={kpis.totalProfessoresAtivos || 0} 
        totalProfessoresInativos={kpis.totalProfessoresInativos || 0} 
      />

      {/* Navegação por Abas (Pills Design) */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8 bg-white p-2 rounded-[2rem] border border-slate-100 shadow-sm w-full md:w-fit">
        <div className="flex p-1 gap-1 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab('todos')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'todos' 
                ? 'bg-[#001a33] text-white shadow-lg' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <LayoutGrid size={16} />
            Todos
          </button>
          
          <button
            onClick={() => setActiveTab('professores')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'professores' 
                ? 'bg-[#001a33] text-white shadow-lg' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Users size={16} />
            Professores
          </button>

          <button
            onClick={() => setActiveTab('alunos')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'alunos' 
                ? 'bg-[#001a33] text-white shadow-lg' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <GraduationCap size={16} />
            Alunos
          </button>

          <button
            onClick={() => setActiveTab('pj')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'pj' 
                ? 'bg-[#001a33] text-white shadow-lg' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Building size={16} />
            Pessoa Jurídica
          </button>

          <button
            onClick={() => setActiveTab('pf')}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === 'pf' 
                ? 'bg-[#001a33] text-white shadow-lg' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <User size={16} />
            Pessoa Física
          </button>
        </div>
      </div>

      <ParceirosFilters 
        onSearch={handleSearch} 
        onSortChange={handleSort} 
        onStatusChange={setStatusFilter}
        onCursoChange={setCursoFilter}
        onTurmaChange={setTurmaFilter}
      />

      <ParceirosList 
        items={sortedAndFilteredPartners}
        isLoading={loadingPartners}
        onSelectParceiro={(parceiro) => setSelectedParceiro(parceiro)} 
      />

      <ParceirosExportModal 
        isOpen={showExportModal} 
        onClose={() => setShowExportModal(false)} 
        filtrosAtuais={{ searchTerm, statusFilter, cursoFilter, turmaFilter }}
      />

      {/* Modal de Matrícula Direta */}
      {showEnrollmentModalForAlunoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001a33]/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl relative border border-slate-100">
            <button 
              onClick={() => setShowEnrollmentModalForAlunoId(null)}
              className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
            >
              <X size={20} />
            </button>
            
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                <BookOpen size={32} />
              </div>
              <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight text-center">
                Matricular Aluno
              </h3>
              <p className="text-slate-550 text-sm text-center mt-1">
                Selecione uma turma para vincular o aluno <strong>{createdAlunoNome}</strong>.
              </p>
            </div>

            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {turmasDisponiveis.length === 0 ? (
                <p className="text-center text-slate-450 text-xs py-6">Nenhuma turma disponível.</p>
              ) : (
                turmasDisponiveis.map((turma) => (
                  <button
                    key={turma.id}
                    onClick={() => setSelectedTurmaIdForEnrollment(turma.id)}
                    className={`w-full flex justify-between items-center p-4 rounded-2xl border text-left transition-all ${
                      selectedTurmaIdForEnrollment === turma.id
                        ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-100'
                        : 'border-slate-100 hover:border-slate-300 bg-slate-50'
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-[#001a33] text-sm">{turma.nome}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                        Código: {turma.codigo} • Turno: {turma.turno}
                      </p>
                    </div>
                    {selectedTurmaIdForEnrollment === turma.id && (
                      <CheckCircle2 className="text-blue-600" size={18} />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="flex gap-3 mt-8 pt-4 border-t border-slate-100">
              <button
                onClick={() => setShowEnrollmentModalForAlunoId(null)}
                className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-650 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
              >
                Pular Matrícula
              </button>
              <button
                onClick={() => {
                  if (!selectedTurmaIdForEnrollment) return;
                  enrollAlunoMutation.mutate({
                    alunoId: showEnrollmentModalForAlunoId,
                    turmaId: selectedTurmaIdForEnrollment
                  });
                }}
                disabled={!selectedTurmaIdForEnrollment || enrollAlunoMutation.isPending}
                className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50"
              >
                {enrollAlunoMutation.isPending ? 'Matriculando...' : 'Confirmar Matrícula'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceirosPage;

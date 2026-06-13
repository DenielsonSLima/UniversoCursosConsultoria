// File: modules/gestor/cadastros/cursos-tecnicos/CursosTecnicosPage.tsx

import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, Loader2, X, Copy, Power, Check } from 'lucide-react';
import CursoTecnicoCard from './components/CursoTecnicoCard';
import CursoGradeCurricularDetails from '../components/CursoGradeCurricularDetails';
import { cadastrosService } from '../cadastros.service';
import { Curso } from '../cadastros.types';

const CursosTecnicosPage: React.FC = () => {
  const [viewState, setViewState] = useState<'list' | 'details'>('list');
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [selectedCurso, setSelectedCurso] = useState<Curso | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtro de Status ('ativo' | 'inativo')
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo'>('ativo');

  // Estados para Modal de Novo Curso
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCursoNome, setNewCursoNome] = useState('');
  const [newCursoDesc, setNewCursoDesc] = useState('');
  const [newCursoArea, setNewCursoArea] = useState('Saúde');
  const [newCursoVersao, setNewCursoVersao] = useState('1.0');
  const [isCreatingCurso, setIsCreatingCurso] = useState(false);

  // Estados para Modal de Duplicação
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateTargetId, setDuplicateTargetId] = useState<string | null>(null);
  const [duplicateNome, setDuplicateNome] = useState('');
  const [duplicateVersao, setDuplicateVersao] = useState('2.0');
  const [isDuplicating, setIsDuplicating] = useState(false);

  const areasDisponiveis = ['Saúde', 'Gestão', 'Tecnologia', 'Educação', 'Outros'];

  useEffect(() => {
    loadCursos();
  }, []);

  const loadCursos = async () => {
    setLoading(true);
    try {
      const data = await cadastrosService.getCursosByModalidade('TECNICO');
      setCursos(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar cursos técnicos.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCurso = (curso: Curso) => {
    setSelectedCurso(curso);
    setViewState('details');
  };

  const handleBack = () => {
    setSelectedCurso(null);
    setViewState('list');
    loadCursos();
  };

  // Criação de Curso
  const handleCreateCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCursoNome.trim()) return;

    setIsCreatingCurso(true);
    try {
      await cadastrosService.createCurso({
        nome: newCursoNome,
        carga_horaria: 0, // Carga horária inicia em 0 e é calculada pela grade curricular
        modalidade: 'TECNICO',
        status: 'ativo',
        area: newCursoArea,
        descricao: newCursoDesc,
        versao: newCursoVersao
      });
      setShowCreateModal(false);
      setNewCursoNome('');
      setNewCursoDesc('');
      setNewCursoArea('Saúde');
      setNewCursoVersao('1.0');
      loadCursos();
    } catch (err) {
      console.error(err);
      alert('Erro ao criar curso no Supabase.');
    } finally {
      setIsCreatingCurso(false);
    }
  };

  // Duplicação de Curso
  const handleOpenDuplicate = (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicateTargetId(curso.id);
    setDuplicateNome(`${curso.nome} (Cópia)`);
    // Tenta sugerir uma versão incremental
    const currentVer = parseFloat(curso.versao);
    setDuplicateVersao(isNaN(currentVer) ? '2.0' : (currentVer + 1.0).toFixed(1));
    setShowDuplicateModal(true);
  };

  const handleDuplicateCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!duplicateTargetId || !duplicateNome.trim()) return;

    setIsDuplicating(true);
    try {
      await cadastrosService.duplicateCurso(duplicateTargetId, duplicateNome, duplicateVersao);
      setShowDuplicateModal(false);
      setDuplicateTargetId(null);
      loadCursos();
      alert('Curso e grade curricular duplicados com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao duplicar curso.');
    } finally {
      setIsDuplicating(false);
    }
  };

  // Alterar Status (Ativo/Inativo)
  const handleToggleStatus = async (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    const novoStatus = curso.status === 'ativo' ? 'inativo' : 'ativo';
    const confirmMsg = novoStatus === 'inativo' 
      ? 'Tem certeza de que deseja INATIVAR este curso? Ele não ficará visível para novas matrículas.' 
      : 'Deseja reativar este curso?';
    
    if (confirm(confirmMsg)) {
      try {
        await cadastrosService.toggleStatus(curso.id, novoStatus);
        loadCursos();
      } catch (err) {
        console.error(err);
        alert('Erro ao alterar status do curso.');
      }
    }
  };

  // Filtra cursos pelo status
  const filteredCursos = cursos.filter(c => c.status === statusFilter);

  // Agrupa os cursos filtrados por Área
  const groupedCursos = filteredCursos.reduce((acc, curso) => {
    const area = curso.area || 'Outros';
    if (!acc[area]) acc[area] = [];
    acc[acc[area].push(curso)];
    // Correção para o acumulador do reduce: precisamos retornar o acumulador
    if (!acc[area]) acc[area] = [];
    return acc;
  }, {} as Record<string, Curso[]>);

  // Vamos fazer de forma limpa
  const groupedClean: Record<string, Curso[]> = {};
  filteredCursos.forEach(c => {
    const area = c.area || 'Outros';
    if (!groupedClean[area]) {
      groupedClean[area] = [];
    }
    groupedClean[area].push(c);
  });

  if (viewState === 'details' && selectedCurso) {
    return (
      <CursoGradeCurricularDetails 
        curso={selectedCurso} 
        onBack={handleBack} 
        onUpdate={loadCursos}
      />
    );
  }

  return (
    <div className="animate-fadeIn relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Cursos Técnicos
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Gerenciamento de grade curricular e ofertas de cursos técnicos.
          </p>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Curso
        </button>
      </div>

      {/* Tabs de Filtro de Status */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-xs border border-slate-200">
        <button 
          onClick={() => setStatusFilter('ativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'ativo' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Ativos ({cursos.filter(c => c.status === 'ativo').length})
        </button>
        <button 
          onClick={() => setStatusFilter('inativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'inativo' 
              ? 'bg-white text-red-500 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Inativos ({cursos.filter(c => c.status === 'inativo').length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : filteredCursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
           <Briefcase className="text-slate-300 mx-auto mb-4" size={48} />
           <p className="text-slate-500 font-medium">Nenhum curso técnico {statusFilter === 'ativo' ? 'ativo' : 'inativo'} cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedClean).map(([area, list]) => (
            <div key={area} className="animate-fadeIn">
              <h3 className="text-base font-black text-[#001a33] uppercase tracking-widest border-l-4 border-emerald-500 pl-3 mb-6 flex items-center gap-2">
                <span>{area}</span>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold">{list.length}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {list.map((curso) => (
                  <CursoTecnicoCard 
                    key={curso.id} 
                    curso={curso} 
                    onClick={() => handleSelectCurso(curso)} 
                    onDuplicate={(e) => handleOpenDuplicate(curso, e)}
                    onToggleStatus={(e) => handleToggleStatus(curso, e)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar Novo Curso */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowCreateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6">Novo Curso Técnico</h3>
            
            <form onSubmit={handleCreateCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome do Curso</label>
                <input 
                  required
                  type="text" 
                  value={newCursoNome}
                  onChange={(e) => setNewCursoNome(e.target.value)}
                  placeholder="Ex: Técnico em Enfermagem"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Área / Categoria</label>
                  <select 
                    value={newCursoArea}
                    onChange={(e) => setNewCursoArea(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                  >
                    {areasDisponiveis.map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                  <input 
                    required
                    type="text" 
                    value={newCursoVersao}
                    onChange={(e) => setNewCursoVersao(e.target.value)}
                    placeholder="Ex: 1.0"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Descrição do Curso</label>
                <textarea 
                  value={newCursoDesc}
                  onChange={(e) => setNewCursoDesc(e.target.value)}
                  placeholder="Resumo sobre a formação e mercado..."
                  className="w-full h-24 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isCreatingCurso}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isCreatingCurso ? 'Criando...' : 'Criar Curso'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Duplicar / Criar Nova Versão */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-slate-100 relative">
            <button 
              onClick={() => setShowDuplicateModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6 flex items-center gap-2">
              <Copy size={20} className="text-emerald-500" />
              <span>Duplicar Curso</span>
            </h3>
            
            <form onSubmit={handleDuplicateCurso} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Nova Versão/Cópia</label>
                <input 
                  required
                  type="text" 
                  value={duplicateNome}
                  onChange={(e) => setDuplicateNome(e.target.value)}
                  placeholder="Ex: Técnico em Enfermagem 2.0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                <input 
                  required
                  type="text" 
                  value={duplicateVersao}
                  onChange={(e) => setDuplicateVersao(e.target.value)}
                  placeholder="Ex: 2.0"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl text-xs text-blue-800 leading-relaxed font-medium">
                Esta ação criará um novo curso clonando toda a estrutura curricular (módulos, disciplinas e aulas) do curso original. O curso original permanecerá intacto.
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isDuplicating}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isDuplicating ? 'Clonando...' : 'Confirmar Duplicação'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowDuplicateModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CursosTecnicosPage;

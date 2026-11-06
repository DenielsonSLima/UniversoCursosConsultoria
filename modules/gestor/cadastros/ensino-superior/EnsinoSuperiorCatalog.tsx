import React from 'react';
import { Building, Plus, Loader2, Trash2, Edit2, Power, Check, Search, LayoutGrid, TableProperties } from 'lucide-react';
import { Curso } from '../cadastros.types';
import CursoSuperiorTable from './CursoSuperiorTable';

interface EnsinoSuperiorCatalogProps {
  readOnly: boolean;
  handleOpenCreate: () => void;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  areaFilter: string;
  setAreaFilter: (value: string) => void;
  areaOptions: string[];
  partnerFilter: string;
  setPartnerFilter: (value: string) => void;
  partnerOptions: string[];
  statusFilter: 'ativo' | 'inativo';
  setStatusFilter: (value: 'ativo' | 'inativo') => void;
  cursos: Curso[];
  displayMode: 'cards' | 'table';
  setDisplayMode: (value: 'cards' | 'table') => void;
  loading: boolean;
  filteredCursos: Curso[];
  handleOpenEdit: (curso: Curso, event: React.MouseEvent) => void;
  handleToggleStatus: (curso: Curso, event: React.MouseEvent) => void;
  handleDeleteCurso: (id: string, event: React.MouseEvent) => void;
  groupedCursos: Record<string, Curso[]>;
}

const EnsinoSuperiorCatalog: React.FC<EnsinoSuperiorCatalogProps> = ({
  readOnly,
  handleOpenCreate,
  searchTerm,
  setSearchTerm,
  areaFilter,
  setAreaFilter,
  areaOptions,
  partnerFilter,
  setPartnerFilter,
  partnerOptions,
  statusFilter,
  setStatusFilter,
  cursos,
  displayMode,
  setDisplayMode,
  loading,
  filteredCursos,
  handleOpenEdit,
  handleToggleStatus,
  handleDeleteCurso,
  groupedCursos,
}: EnsinoSuperiorCatalogProps) => (
  <>
      {/* Header */}
      <div className="formacao-recursos-header flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="formacao-recursos-title text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Ensino Superior
          </h2>
          <p className="formacao-recursos-subtitle text-slate-500 font-medium mt-1">
            Vitrine de Graduações e Pós-Graduações oferecidas em parceria com outras instituições.
          </p>
        </div>
        
        {!readOnly && <button
          onClick={handleOpenCreate}
          className="formacao-recursos-primary flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Curso Superior
        </button>}
      </div>

      {readOnly && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
          Modo de visualização do polo: cadastros e alterações são exclusivos da Matriz.
        </div>
      )}

      {/* Info Box sobre o funcionamento das Parcerias */}
      <div className="formacao-recursos-info bg-blue-50/70 border border-blue-100 p-5 rounded-3xl mb-8 flex items-start gap-4 shadow-sm">
        <div className="p-3 bg-blue-100 text-blue-800 rounded-2xl shrink-0">
          <Building size={24} />
        </div>
        <div>
          <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight mb-1">Modelo de Afiliados / Parcerias</h4>
          <p className="text-xs text-blue-800 leading-relaxed font-medium">
            Estes cursos não possuem gestão de grade curricular (módulos/aulas) local, pois a parte acadêmica é controlada diretamente pelas faculdades parceiras. O cadastro aqui serve exclusivamente como uma <strong>vitrine no site público</strong> para captação de alunos e redirecionamento.
          </p>
        </div>
      </div>

      {/* Busca e filtros da vitrine */}
      <div className="formacao-recursos-filters mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-6">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400">
              <Search size={17} />
            </span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar curso por nome, descrição ou parceiro..."
              aria-label="Buscar cursos superiores"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-xs font-bold text-slate-700 outline-none transition-all placeholder:font-medium placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="lg:col-span-3">
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              aria-label="Filtrar cursos superiores por categoria"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold tracking-normal text-slate-700 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              <option value="Todas" className="font-medium">Todas as categorias</option>
              {areaOptions.map((area) => (
                <option key={area} value={area} className="font-medium">{area}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3">
            <select
              value={partnerFilter}
              onChange={(event) => setPartnerFilter(event.target.value)}
              aria-label="Filtrar cursos superiores por parceiro"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold tracking-normal text-slate-700 outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              <option value="Todos" className="font-medium">Todos os parceiros</option>
              {partnerOptions.map((partner) => (
                <option key={partner} value={partner} className="font-medium">{partner}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Status e modo de visualização */}
      <div className="formacao-recursos-display mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full max-w-xs gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1">
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

        <div
          className="flex w-fit items-center rounded-xl border border-slate-200 bg-slate-100 p-1"
          aria-label="Modo de visualização"
        >
          <button
            type="button"
            onClick={() => setDisplayMode('cards')}
            aria-pressed={displayMode === 'cards'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all ${
              displayMode === 'cards'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LayoutGrid size={13} />
            Cards
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode('table')}
            aria-pressed={displayMode === 'table'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all ${
              displayMode === 'table'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <TableProperties size={13} />
            Tabela
          </button>
        </div>
      </div>

      {/* Listagem */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : filteredCursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-300">
           <Building className="text-slate-300 mx-auto mb-4 animate-pulse" size={48} />
           <p className="text-slate-500 font-bold">Nenhum curso superior encontrado.</p>
           <p className="mt-1 text-xs text-slate-400">Ajuste a busca ou os filtros de categoria e parceiro.</p>
        </div>
      ) : (
        displayMode === 'table' ? (
          <div className="animate-fadeIn">
            <CursoSuperiorTable
              cursos={filteredCursos}
              readOnly={readOnly}
              onEdit={handleOpenEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDeleteCurso}
            />
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedCursos).map(([area, list]) => (
              <div key={area} className="animate-fadeIn">
                <h3 className="formacao-recursos-group text-sm font-black text-[#001a33] uppercase tracking-widest border-l-4 border-blue-600 pl-3 mb-6 flex items-center gap-2">
                  <span>{area}</span>
                  <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">{list.length}</span>
                </h3>

                <div className="formacao-recursos-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {list.map((curso) => (
                  <div 
                    key={curso.id} 
                    className="formacao-recursos-superior-card bg-white rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex flex-col justify-between min-h-[340px] relative overflow-hidden group"
                  >
                    <div>
                      {/* Imagem do Card */}
                      {curso.imagem_url && (
                        <div className="h-24 w-full bg-slate-50 border border-slate-100 rounded-xl overflow-hidden mb-3">
                          <img src={curso.imagem_url} alt={curso.nome} className="w-full h-full object-cover" />
                        </div>
                      )}

                      {/* Logo do Parceiro e Categoria */}
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div className="formacao-recursos-partner-logo h-12 w-28 bg-slate-50 border border-slate-100 rounded-xl p-2 flex items-center justify-center overflow-hidden">
                          {curso.parceiro_logo_url ? (
                            <img 
                              src={curso.parceiro_logo_url} 
                              alt={curso.parceiro_instituicao} 
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <Building className="text-slate-300" size={20} />
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-md">
                          {curso.area}
                        </span>
                      </div>

                      {/* Nome do Curso */}
                      <h4 className="formacao-recursos-course-title text-base font-bold text-[#001a33] leading-tight mb-2 group-hover:text-blue-600 transition-colors">
                        {curso.nome}
                      </h4>
                      
                      {/* Nome do Parceiro */}
                      <p className="formacao-recursos-partner-name text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                        {curso.parceiro_instituicao}
                      </p>

                      {/* Descrição */}
                      <p className="formacao-recursos-course-desc text-xs text-slate-500 line-clamp-3 leading-relaxed">
                        {curso.descricao || 'Sem descrição cadastrada.'}
                      </p>
                    </div>

                    {/* Rodapé do Card: Ações */}
                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">
                        Versão {curso.versao || '1.0'}
                      </span>
                      
                      {!readOnly && <div className="flex items-center gap-1">
                        {/* Toggle Status */}
                        <button
                          onClick={(e) => handleToggleStatus(curso, e)}
                          title={curso.status === 'ativo' ? 'Inativar curso' : 'Ativar curso'}
                          className={`p-2 rounded-lg transition-colors ${
                            curso.status === 'ativo' 
                              ? 'text-emerald-500 hover:bg-emerald-50' 
                              : 'text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          {curso.status === 'ativo' ? <Check size={16} /> : <Power size={16} />}
                        </button>

                        {/* Editar */}
                        <button
                          onClick={(e) => handleOpenEdit(curso, e)}
                          title="Editar curso"
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>

                        {/* Excluir */}
                        <button
                          onClick={(e) => handleDeleteCurso(curso.id, e)}
                          title="Excluir curso"
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>}
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

  </>
);

export default EnsinoSuperiorCatalog;

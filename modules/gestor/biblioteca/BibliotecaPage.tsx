// File: modules/gestor/biblioteca/BibliotecaPage.tsx

import React, { useState } from 'react';
import { 
  BookOpen, LayoutGrid, Users, Award, Eye, Download, 
  Clock, Calendar, Sparkles, Folder, Lock, Search, Trash2
} from 'lucide-react';

import FileExplorer from './components/FileExplorer';
import TeacherRepositoryList from './components/TeacherRepository';
import UploadModal from './components/UploadModal';
import QuickPreviewModal from './components/QuickPreviewModal';
import DocumentPermissionsModal from './components/DocumentPermissionsModal';
import { LibraryDocument } from './biblioteca.types';
import { useBibliotecaPageQueries } from './hooks/useBibliotecaPageQueries';
import { useBibliotecaPageMutations } from './hooks/useBibliotecaPageMutations';

type LibraryTab = 'destaques' | 'gerenciador' | 'professores' | 'regras';

const BibliotecaPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LibraryTab>('destaques');
  
  // Modal Upload States
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadPastaId, setUploadPastaId] = useState<string | null>(null);
  const [uploadTeacherId, setUploadTeacherId] = useState<string | null>(null);

  // Preview Modal States
  const [previewDoc, setPreviewDoc] = useState<LibraryDocument | null>(null);

  // Rules and permissions states
  const [permissionsDoc, setPermissionsDoc] = useState<LibraryDocument | null>(null);
  const [searchRegrasQuery, setSearchRegrasQuery] = useState('');

  const {
    cursosList,
    turmasList,
    disciplinasList,
    allDocs,
    isAllDocsLoading,
    topAccessed,
    isTopLoading,
    topRecent,
    isRecentLoading,
  } = useBibliotecaPageQueries(activeTab);

  const {
    uploadMutation,
    deleteMutation,
    invalidateDocuments,
    invalidateHighlights,
  } = useBibliotecaPageMutations();

  const getCursoName = (id: string) => cursosList.find((c: any) => c.id === id)?.nome || id;
  const getTurmaName = (id: string) => turmasList.find((t: any) => t.id === id)?.nome || id;
  const getDisciplinaName = (id: string) => disciplinasList.find((d: any) => d.id === id)?.nome || id;

  const handleDeleteDocument = async (id: string) => {
    await deleteMutation.mutateAsync(id);
  };

  const filteredAllDocs = allDocs.filter(doc => 
    doc.title.toLowerCase().includes(searchRegrasQuery.toLowerCase())
  );

  // Handle uploading document
  const handleUploadSubmit = async (uploadData: any) => {
    await uploadMutation.mutateAsync(uploadData);
  };

  const handleOpenUpload = (pastaId: string | null, teacherId: string | null = null) => {
    setUploadPastaId(pastaId);
    setUploadTeacherId(teacherId);
    setIsUploadOpen(true);
  };

  const handleOpenPreview = (doc: LibraryDocument) => {
    setPreviewDoc(doc);
    // Invalidate highlight queries after visual count update
    setTimeout(() => {
      invalidateHighlights();
    }, 1000);
  };

  const getFileIcon = (type: string) => {
    switch(type) {
        case 'PDF': return <div className="w-8 h-8 rounded-lg bg-red-50 text-red-650 flex items-center justify-center font-black text-[10px] border border-red-100 shrink-0">PDF</div>;
        case 'DOC': return <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-650 flex items-center justify-center font-black text-[10px] border border-blue-100 shrink-0">DOC</div>;
        case 'XLS': return <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-650 flex items-center justify-center font-black text-[10px] border border-emerald-100 shrink-0">XLS</div>;
        default: return <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center font-black text-[10px] border border-slate-150 shrink-0">FILE</div>;
    }
  };

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn min-h-screen pb-12 space-y-8">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-blue-600">
            <BookOpen size={20} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Gestão Acadêmica</span>
          </div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Biblioteca Digital
          </h2>
          <p className="text-slate-500 font-medium">
            Gerenciamento de acervo, documentos, planos de aulas e materiais didáticos organizados por polos e docentes.
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white p-1.5 rounded-[2rem] border border-slate-150 shadow-sm flex flex-wrap gap-1 w-full max-w-4xl">
          <button
              onClick={() => setActiveTab('destaques')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'destaques' 
                  ? 'bg-[#001a33] text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
              <Sparkles size={14} /> Destaques
          </button>
          <button
              onClick={() => setActiveTab('gerenciador')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'gerenciador' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
              <LayoutGrid size={14} /> Gerenciador de Arquivos
          </button>
          <button
              onClick={() => setActiveTab('professores')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'professores' 
                  ? 'bg-purple-650 bg-purple-600 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
              <Users size={14} /> Bibliotecas dos Professores
          </button>
          <button
              onClick={() => setActiveTab('regras')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                  activeTab === 'regras' 
                  ? 'bg-amber-600 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
              <Lock size={14} /> Regras de Liberação
          </button>
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        
        {/* TAB 1: DESTAQUES (DASHBOARD) */}
        {activeTab === 'destaques' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn">
            
            {/* Top 10 Mais Acessados */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-150 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                  <Award size={18} className="text-amber-500" /> Mais Acessados (Top 10)
                </h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Materiais mais consultados pelos estudantes e docentes.</p>
              </div>

              <div className="space-y-3">
                {isTopLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">Carregando acessos...</div>
                ) : topAccessed.length > 0 ? (
                  topAccessed.map((doc, idx) => (
                    <div 
                      key={doc.id}
                      className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 truncate mr-4">
                        <span className="text-xs font-black text-slate-350 w-4">{idx + 1}</span>
                        {getFileIcon(doc.fileType)}
                        <div className="truncate">
                          <p className="text-xs font-bold text-[#001a33] truncate">{doc.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{doc.size} • Autor: {doc.authorName}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-black text-slate-550 text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Eye size={10} className="text-blue-500" /> {doc.acessos} views
                        </span>
                        <button 
                          onClick={() => handleOpenPreview(doc)}
                          className="p-2 text-slate-450 hover:text-blue-650 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all shrink-0"
                          title="Visualização Rápida"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2.5rem]">
                    Nenhum documento acessado ainda.
                  </div>
                )}
              </div>
            </div>

            {/* Top 10 Últimos Enviados */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-150 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                  <Clock size={18} className="text-blue-500" /> Últimos Enviados (Top 10)
                </h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Materiais publicados recentemente no acervo.</p>
              </div>

              <div className="space-y-3">
                {isRecentLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">Carregando recentes...</div>
                ) : topRecent.length > 0 ? (
                  topRecent.map((doc, idx) => (
                    <div 
                      key={doc.id}
                      className="p-3.5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 truncate mr-4">
                        <span className="text-xs font-black text-slate-350 w-4">{idx + 1}</span>
                        {getFileIcon(doc.fileType)}
                        <div className="truncate">
                          <p className="text-xs font-bold text-[#001a33] truncate">{doc.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                            {doc.size} • Enviado em: {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Calendar size={10} className="text-emerald-500" /> Recente
                        </span>
                        <button 
                          onClick={() => handleOpenPreview(doc)}
                          className="p-2 text-slate-450 hover:text-blue-650 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all shrink-0"
                          title="Visualização Rápida"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2.5rem]">
                    Nenhum documento recente publicado.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: GERENCIADOR INSTITUCIONAL */}
        {activeTab === 'gerenciador' && (
          <FileExplorer 
            teacherId={null} 
            onPreviewClick={handleOpenPreview}
            onNewUploadClick={(pastaId) => handleOpenUpload(pastaId, null)}
          />
        )}

        {/* TAB 3: BIBLIOTECA DOS PROFESSORES */}
        {activeTab === 'professores' && (
          <TeacherRepositoryList 
            onPreviewClick={handleOpenPreview}
            onNewUploadClick={handleOpenUpload}
          />
        )}

        {/* TAB 4: REGRAS DE LIBERAÇÃO */}
        {activeTab === 'regras' && (
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-150 shadow-sm space-y-6 animate-fadeIn">
            {/* Header tab */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                  <Lock size={18} className="text-amber-500" /> Controle de Acesso e Liberação
                </h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Gerencie agendamentos de liberação e restrições por turmas ou cursos.</p>
              </div>
              <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs w-full sm:w-64">
                <Search size={14} className="text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Pesquisar documento..."
                  value={searchRegrasQuery}
                  onChange={(e) => setSearchRegrasQuery(e.target.value)}
                  className="bg-transparent border-none outline-none w-full font-medium"
                />
              </div>
            </div>

            {/* List Table */}
            {isAllDocsLoading ? (
              <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">Carregando documentos...</div>
            ) : filteredAllDocs.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-400 font-black uppercase tracking-wider text-[9px] border-b border-slate-100">
                      <th className="p-4">Documento</th>
                      <th className="p-4">Público-Alvo</th>
                      <th className="p-4">Cursos / Turmas</th>
                      <th className="p-4">Regra de Liberação</th>
                      <th className="p-4 text-center">Status</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredAllDocs.map((doc) => {
                      const isRestricted = (doc.cursoIds && doc.cursoIds.length > 0) || 
                                           (doc.turmaIds && doc.turmaIds.length > 0) || 
                                           (doc.disciplinaIds && doc.disciplinaIds.length > 0) ||
                                           doc.poloId || 
                                           doc.liberacaoTipo !== 'IMEDIATO';

                      // Status determination
                      let statusText = 'Imediato';
                      let statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                      
                      if (doc.liberacaoTipo === 'POR_DATA') {
                        const releaseDate = doc.liberacaoData ? new Date(doc.liberacaoData) : null;
                        if (releaseDate && new Date() >= releaseDate) {
                          statusText = 'Liberado (Data)';
                          statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                        } else {
                          statusText = `Agendado (${releaseDate ? releaseDate.toLocaleDateString('pt-BR') : ''})`;
                          statusStyle = 'bg-amber-50 text-amber-700 border-amber-100';
                        }
                      } else if (doc.liberacaoTipo === 'DISCIPLINA_INICIO') {
                        statusText = 'Gatilho Disciplina';
                        statusStyle = 'bg-blue-50 text-blue-700 border-blue-100';
                      }

                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4">
                            <div>
                              <p className="font-bold text-[#001a33]">{doc.title}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{doc.size} • Autor: {doc.authorName}</p>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded text-[9px] font-bold uppercase border border-slate-200">
                              {doc.targetAudience}
                            </span>
                          </td>
                          <td className="p-4 max-w-[200px] truncate">
                            {isRestricted ? (
                              <div className="space-y-1">
                                {doc.cursoIds && doc.cursoIds.length > 0 && (
                                  <p className="text-[9px] text-blue-655 font-bold uppercase">
                                    Cursos: {doc.cursoIds.map(getCursoName).join(', ')}
                                  </p>
                                )}
                                {doc.turmaIds && doc.turmaIds.length > 0 && (
                                  <p className="text-[9px] text-emerald-655 font-bold uppercase">
                                    Turmas: {doc.turmaIds.map(getTurmaName).join(', ')}
                                  </p>
                                )}
                                {doc.poloName && (
                                  <p className="text-[9px] text-purple-655 font-bold uppercase">
                                    Polo: {doc.poloName}
                                  </p>
                                )}
                                {!doc.cursoIds?.length && !doc.turmaIds?.length && !doc.poloName && (
                                  <span className="text-[9px] text-slate-400 font-bold uppercase">Sem restrição de curso/turma</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">Todos</span>
                            )}
                          </td>
                          <td className="p-4">
                            {doc.liberacaoTipo === 'POR_DATA' && doc.liberacaoData ? (
                              <p className="font-bold text-slate-700">Data: {new Date(doc.liberacaoData).toLocaleString('pt-BR')}</p>
                            ) : doc.liberacaoTipo === 'DISCIPLINA_INICIO' && doc.liberacaoDisciplinaId ? (
                              <p className="font-bold text-slate-700">
                                1ª Aula: <span className="text-blue-600">{getDisciplinaName(doc.liberacaoDisciplinaId)}</span>
                                {doc.liberacaoDiasValidade && ` (Válido por ${doc.liberacaoDiasValidade} dias)`}
                              </p>
                            ) : (
                              <span className="text-slate-400">Imediata</span>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase border ${statusStyle}`}>
                              {statusText}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenPreview(doc)}
                                className="p-1.5 text-slate-400 hover:text-blue-650 hover:bg-slate-50 border border-slate-100 rounded-lg transition-colors"
                                title="Visualizar"
                              >
                                <Eye size={12} />
                              </button>
                              <button
                                onClick={() => setPermissionsDoc(doc)}
                                className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-slate-50 border border-slate-100 rounded-lg transition-colors"
                                title="Regras de Liberação"
                              >
                                <Lock size={12} />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Deseja excluir permanentemente este documento?')) {
                                    handleDeleteDocument(doc.id);
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-rose-650 hover:bg-slate-50 border border-slate-100 rounded-lg transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2.5rem]">
                Nenhum documento encontrado.
              </div>
            )}
          </div>
        )}

      </div>

      {/* Upload Modal Wrapper */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUploadSubmit}
        pastaId={uploadPastaId}
        teacherId={uploadTeacherId}
      />

      {/* Quick Preview Modal Wrapper */}
      <QuickPreviewModal 
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />

      {/* Document Permissions Modal Wrapper */}
      <DocumentPermissionsModal
        isOpen={!!permissionsDoc}
        onClose={() => setPermissionsDoc(null)}
        document={permissionsDoc}
        onSave={() => {
          invalidateDocuments();
        }}
      />

    </div>
  );
};

export default BibliotecaPage;

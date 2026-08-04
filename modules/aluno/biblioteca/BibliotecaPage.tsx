import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { 
  BookOpen, FolderOpen, Download, 
  Search, LayoutGrid, List, ChevronRight, Eye, Check
} from 'lucide-react';
import QuickPreviewModal from '../../gestor/biblioteca/components/QuickPreviewModal';
import LibrarySelectionToolbar from '../../gestor/biblioteca/components/LibrarySelectionToolbar';
import LibraryFileThumbnail from '../../gestor/biblioteca/components/file-preview/LibraryFileThumbnail';
import LibraryFolderGrid from '../../gestor/biblioteca/components/LibraryFolderGrid';
import { LibraryDocument, LibraryFolder } from '../../gestor/biblioteca/biblioteca.types';
import {
  downloadLibrarySelectionAsZip,
  downloadSingleLibraryFile
} from '../../shared/library/library-download';
import { resolveLibraryFileUrl } from '../../shared/library/library-storage';
import {
  canAccessLibraryDocumentAsAluno,
  isLibraryUrl,
  matchesLibrarySearch
} from './libraryAccess';
import { alunoCourseAccessKeys } from '../shared/aluno-course-access.queries';
import AlunoMobileLibrary from './components/mobile/AlunoMobileLibrary';
import useAlunoMobileLayout from '../hooks/useAlunoMobileLayout';

interface BibliotecaPageProps {
  alunoId: string;
}

const BibliotecaPage: React.FC<BibliotecaPageProps> = ({ alunoId }) => {
  const isMobileLayout = useAlunoMobileLayout();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; nome: string }>>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [isDownloadingSelection, setIsDownloadingSelection] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');
  
  // Preview State
  const [previewDoc, setPreviewDoc] = useState<LibraryDocument | null>(null);

  // 1. Busca as matrículas ativas do aluno para obter cursos, turmas e polos
  const { data: matriculas = [], isLoading: loadingMatriculas, isError: matriculasError, refetch: refetchMatriculas } = useQuery<any[]>({
    queryKey: alunoCourseAccessKeys.libraryEnrollments(alunoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*))')
        .eq('aluno_id', alunoId)
        .eq('status', 'ATIVO');
      if (error) throw error;
      return data || [];
    }
  });

  const activeTurmaIds = matriculas.map(m => m.turma_id).filter(Boolean);
  const activeCursoIds = Array.from(new Set(matriculas.map(m => m.turmas?.cursos?.id).filter(Boolean)));
  const activePoloIds = Array.from(new Set(matriculas.map(m => m.turmas?.polo_id).filter(Boolean)));

  // 2. Busca os professores vinculados às turmas do aluno
  const { data: activeTeachers = [], isError: activeTeachersError, refetch: refetchActiveTeachers } = useQuery<any[]>({
    queryKey: ['aluno-biblioteca-professores', activeTurmaIds.join(',')],
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

  const { data: turmaDisciplinas = [], isError: turmaDisciplinasError, refetch: refetchTurmaDisciplinas } = useQuery<any[]>({
    queryKey: ['aluno-biblioteca-turma-disciplinas', activeTurmaIds.join(',')],
    queryFn: async () => {
      if (activeTurmaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('turmas_disciplinas')
        .select('turma_id, disciplina_id, created_at, concluida')
        .in('turma_id', activeTurmaIds);
      if (error) throw error;
      return data || [];
    },
    enabled: activeTurmaIds.length > 0
  });

  const teacherIds = activeTeachers.map(at => at.professor_id).filter(Boolean);

  // 3. Busca pastas reais da biblioteca (Gestão + Seus Professores)
  const { data: dbFolders = [], isLoading: loadingFolders, isError: foldersError, refetch: refetchFolders } = useQuery<any[]>({
    queryKey: ['aluno-biblioteca-pastas', selectedFolderId, teacherIds],
    queryFn: async () => {
      let query = supabase.from('biblioteca_pastas').select('*');

      if (selectedFolderId === null) {
        query = query.is('parent_id', null);
      } else {
        query = query.eq('parent_id', selectedFolderId);
      }

      const { data, error } = await query.order('nome', { ascending: true });
      if (error) throw error;

      // Mantém visíveis apenas pastas institucionais ou de professores vinculados ao aluno.
      return (data || []).filter(
        (folder: any) => folder.teacher_id === null || teacherIds.includes(folder.teacher_id)
      );
    }
  });

  // 4. Busca os documentos reais da biblioteca
  const { data: dbDocs = [], isLoading: loadingDocs, isError: documentsError, refetch: refetchDocuments } = useQuery<any[]>({
    queryKey: ['aluno-biblioteca-documentos', selectedFolderId],
    queryFn: async () => {
      let query = supabase.from('biblioteca_documentos').select('*');

      if (selectedFolderId === null) {
        query = query.is('pasta_id', null);
      } else {
        query = query.eq('pasta_id', selectedFolderId);
      }

      const { data, error } = await query.order('titulo', { ascending: true });
      if (error) throw error;
      return Promise.all((data || []).map(async (document: any) => ({
        ...document,
        arquivo_url: await resolveLibraryFileUrl(document.arquivo_url),
      })));
    }
  });

  const accessContext = {
    activeTurmaIds,
    activeCursoIds,
    activePoloIds,
    activeTeacherIds: teacherIds,
    turmaDisciplinas,
  };

  const visibleFolders: LibraryFolder[] = dbFolders.map((folder: any) => ({
    id: folder.id,
    nome: folder.nome,
    parentId: folder.parent_id,
    teacherId: folder.teacher_id,
    targetAudience: folder.publico_alvo || 'INTERNO',
    createdAt: folder.created_at,
  }));

  // 5. Filtro avançado de documentos com base nas regras de liberação do aluno
  const filteredDocuments = (dbDocs || []).filter((doc: any) => {
    return canAccessLibraryDocumentAsAluno(doc, accessContext) && matchesLibrarySearch(doc, searchQuery);
  });

  const handleOpenFolder = (folder: any) => {
    setSelectedFolderId(folder.id);
    setBreadcrumbs([...breadcrumbs, { id: folder.id, nome: folder.nome }]);
    setSelectedFolderIds(new Set());
    setSelectedDocumentIds(new Set());
  };

  const handleBreadcrumbClick = (folderId: string | null, index: number) => {
    setSelectedFolderId(folderId);
    setSelectedFolderIds(new Set());
    setSelectedDocumentIds(new Set());
    if (folderId === null) {
      setBreadcrumbs([]);
    } else {
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    }
  };

  const handleOpenPreview = (doc: any) => {
    // Converte o model retornado do DB para o tipo LibraryDocument esperado pelo QuickPreviewModal
    const previewData: LibraryDocument = {
      id: doc.id,
      pastaId: doc.pasta_id,
      title: doc.titulo,
      description: doc.descricao || '',
      fileType: doc.tipo_arquivo,
      size: doc.tamanho,
      url: doc.arquivo_url,
      targetAudience: doc.publico_alvo,
      scope: doc.abrangencia,
      poloId: doc.polo_id,
      authorName: doc.author_name || 'Instituição',
      acessos: doc.acessos || 0,
      createdAt: doc.created_at
    };
    
    // Incrementa acessos
    supabase.from('biblioteca_documentos')
      .select('acessos')
      .eq('id', doc.id)
      .single()
      .then(({ data }) => {
        const current = data?.acessos || 0;
        supabase.from('biblioteca_documentos').update({ acessos: current + 1 }).eq('id', doc.id);
      });

    setPreviewDoc(previewData);
  };

  const incrementDocumentAccess = (documentId: string) => {
    supabase.from('biblioteca_documentos')
      .select('acessos')
      .eq('id', documentId)
      .single()
      .then(({ data }) => {
        const current = data?.acessos || 0;
        supabase.from('biblioteca_documentos').update({ acessos: current + 1 }).eq('id', documentId);
      });
  };

  const handleDownloadDocument = async (document: any) => {
    try {
      await downloadSingleLibraryFile({
        id: document.id,
        folderId: document.pasta_id || null,
        name: document.titulo,
        url: document.arquivo_url,
        fileType: document.tipo_arquivo,
        sizeBytes: document.tamanho_bytes,
      });
      incrementDocumentAccess(document.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.');
    }
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const toggleDocumentSelection = (documentId: string) => {
    setSelectedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedFolderIds(new Set());
    setSelectedDocumentIds(new Set());
  };

  const selectVisibleItems = () => {
    setSelectedFolderIds(new Set(dbFolders.map((folder: any) => folder.id)));
    setSelectedDocumentIds(new Set(filteredDocuments.map((document: any) => document.id)));
  };

  const handleDownloadSelection = async () => {
    const folderIds = Array.from(selectedFolderIds) as string[];
    const documentIds = Array.from(selectedDocumentIds) as string[];
    const selectionCount = folderIds.length + documentIds.length;
    if (selectionCount === 0) return;

    if (folderIds.length === 0 && documentIds.length === 1) {
      const document = dbDocs.find(
        (item: any) =>
          item.id === documentIds[0] &&
          canAccessLibraryDocumentAsAluno(item, accessContext)
      );
      if (!document) return;

      try {
        await downloadSingleLibraryFile({
          id: document.id,
          folderId: document.pasta_id || null,
          name: document.titulo,
          url: document.arquivo_url,
          fileType: document.tipo_arquivo,
          sizeBytes: document.tamanho_bytes
        });
        incrementDocumentAccess(document.id);
        clearSelection();
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Não foi possível baixar o arquivo.');
      }
      return;
    }

    setIsDownloadingSelection(true);
    setDownloadProgress('Carregando a estrutura da biblioteca...');

    try {
      const { data: manifest, error: manifestError } = await supabase.rpc(
        'biblioteca_aluno_download_manifest',
        {
          p_folder_ids: folderIds,
          p_document_ids: documentIds
        }
      );

      if (manifestError) throw manifestError;

      const downloadManifest = manifest as {
        folders?: Array<{ id: string; name: string; parentId: string | null }>;
        documents?: Array<{
          id: string;
          folderId: string | null;
          name: string;
          url: string;
          fileType?: string;
          sizeBytes?: number | null;
        }>;
      } | null;

      const resolvedDocuments = await Promise.all((downloadManifest?.documents || []).map(async (document) => ({
        ...document,
        url: await resolveLibraryFileUrl(document.url),
      })));

      await downloadLibrarySelectionAsZip({
        selectedFolderIds: folderIds,
        selectedDocumentIds: documentIds,
        folders: downloadManifest?.folders || [],
        documents: resolvedDocuments,
        archiveName: breadcrumbs.at(-1)?.nome || 'biblioteca-aluno',
        onProgress: setDownloadProgress
      });

      clearSelection();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível preparar o arquivo ZIP.');
    } finally {
      setIsDownloadingSelection(false);
      setDownloadProgress('');
    }
  };

  const isLoading = loadingMatriculas || loadingFolders || loadingDocs;
  const hasLibraryError = matriculasError || activeTeachersError || turmaDisciplinasError || foldersError || documentsError;
  const retryLibrary = () => {
    void Promise.all([
      refetchMatriculas(),
      refetchActiveTeachers(),
      refetchTurmaDisciplinas(),
      refetchFolders(),
      refetchDocuments(),
    ]);
  };
  const selectionCount = selectedFolderIds.size + selectedDocumentIds.size;

  return (
    <div className="space-y-6 animate-fadeIn text-xs font-sans">
      {isMobileLayout ? <AlunoMobileLibrary
        breadcrumbs={breadcrumbs}
        documents={filteredDocuments}
        folders={dbFolders}
        isDownloadingSelection={isDownloadingSelection}
        isLoading={isLoading}
        isError={hasLibraryError}
        progressMessage={downloadProgress}
        searchQuery={searchQuery}
        selectedDocumentIds={selectedDocumentIds}
        selectedFolderIds={selectedFolderIds}
        onBreadcrumbClick={handleBreadcrumbClick}
        onClearSelection={clearSelection}
        onDownloadSelection={() => void handleDownloadSelection()}
        onDownloadDocument={(document) => void handleDownloadDocument(document)}
        onOpenFolder={handleOpenFolder}
        onOpenPreview={handleOpenPreview}
        onRetry={retryLibrary}
        onSearchChange={setSearchQuery}
        onSelectVisible={selectVisibleItems}
        onToggleDocument={toggleDocumentSelection}
        onToggleFolder={toggleFolderSelection}
      /> : null}

      {!isMobileLayout ? <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="text-blue-600" />
            Biblioteca e Acervo
          </h2>
          <p className="text-xs text-slate-450 font-medium">Consulte e baixe apostilas, manuais e materiais didáticos compartilhados</p>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <input 
              type="text" 
              placeholder="Pesquisar acervo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 focus:border-blue-500 outline-none rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-705 shadow-sm transition-all"
            />
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <LayoutGrid size={15} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Explorer Path */}
      <div className="flex items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-wider bg-slate-50 p-4 rounded-2xl border border-slate-150">
        <button 
          onClick={() => handleBreadcrumbClick(null, -1)}
          className="hover:text-[#001a33] transition-colors"
        >
          Biblioteca Principal
        </button>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={crumb.id}>
            <ChevronRight size={12} className="text-slate-300" />
            <button 
              onClick={() => handleBreadcrumbClick(crumb.id, idx)}
              className={`hover:text-[#001a33] transition-colors ${idx === breadcrumbs.length - 1 ? 'text-[#001a33] font-black' : ''}`}
            >
              {crumb.nome}
            </button>
          </React.Fragment>
        ))}
      </div>

      {selectionCount > 0 && (
        <LibrarySelectionToolbar
          count={selectionCount}
          isZipDownload={selectedFolderIds.size > 0 || selectionCount > 1}
          isDownloading={isDownloadingSelection}
          progressMessage={downloadProgress}
          onDownload={handleDownloadSelection}
          onClear={clearSelection}
          onSelectVisible={selectVisibleItems}
        />
      )}

      {isLoading ? (
        <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-wider animate-pulse">
          Buscando acervo digital...
        </div>
      ) : (
        <div className="space-y-6">
          <LibraryFolderGrid
            folders={visibleFolders}
            selectedIds={selectedFolderIds}
            onOpen={handleOpenFolder}
            onToggle={toggleFolderSelection}
          />

          {/* Documents Section */}
          <div className="space-y-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Arquivos Pedagógicos</span>
            
            {filteredDocuments.length === 0 && dbFolders.length === 0 ? (
              <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center space-y-2">
                <FolderOpen size={36} className="mx-auto text-slate-350" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Diretório Vazio</h4>
                <p className="text-[10px] text-slate-400 font-medium">Nenhum material publicado nesta pasta para o seu curso/turma.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredDocuments.map(doc => (
                  <div 
                    key={doc.id}
                    className={`relative border rounded-[2rem] p-5 shadow-sm flex flex-col justify-between hover:shadow-lg hover:border-blue-300 transition-all h-full ${
                      selectedDocumentIds.has(doc.id)
                        ? 'border-blue-300 bg-white shadow-[0_10px_28px_rgba(37,99,235,0.12)]'
                        : 'border-slate-150 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDocumentSelection(doc.id)}
                      className={`absolute right-3 top-3 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                        selectedDocumentIds.has(doc.id)
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-transparent hover:border-blue-400'
                      }`}
                      aria-label={`${selectedDocumentIds.has(doc.id) ? 'Remover' : 'Selecionar'} arquivo ${doc.titulo}`}
                      aria-pressed={selectedDocumentIds.has(doc.id)}
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <div>
                      <div className="mb-4 pr-7">
                        <LibraryFileThumbnail
                          file={{
                            fileType: doc.tipo_arquivo,
                            title: doc.titulo,
                            url: doc.arquivo_url,
                          }}
                        />
                        <span className="mt-2 block text-right text-[9px] font-bold text-slate-400 font-mono">{doc.tamanho}</span>
                      </div>

                      <div className="space-y-1 mb-6">
                        <h4 className="font-bold text-xs text-[#001a33] line-clamp-2" title={doc.titulo}>{doc.titulo}</h4>
                        <p className="text-[10px] text-slate-450 line-clamp-2 leading-relaxed">{doc.descricao || 'Sem descrição.'}</p>
                      </div>
                    </div>

                    <div className="flex gap-1.5 mt-auto pt-4 border-t border-slate-50">
                      <button 
                        onClick={() => handleOpenPreview(doc)}
                        className="flex-1 py-2 bg-slate-50 hover:bg-blue-50 text-slate-650 hover:text-blue-700 font-bold uppercase tracking-wider text-[10px] rounded-xl transition-all border border-slate-100 flex items-center justify-center gap-1"
                      >
                        <Eye size={12} />
                        <span>Visualizar</span>
                      </button>
                        <a 
                        href={isLibraryUrl(doc.arquivo_url) ? doc.arquivo_url : undefined}
                        download={isLibraryUrl(doc.arquivo_url) ? doc.titulo : undefined}
                        onClick={(e) => {
                          if (!isLibraryUrl(doc.arquivo_url)) {
                            e.preventDefault();
                            alert('Download simulado indisponível.');
                          }
                        }}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-505 rounded-xl border border-slate-100 flex items-center justify-center"
                        title="Baixar"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] border border-slate-150 shadow-sm overflow-hidden divide-y divide-slate-100">
                {filteredDocuments.map(doc => (
                  <div
                    key={doc.id}
                    className={`p-4 flex items-center justify-between transition-colors gap-4 ${
                      selectedDocumentIds.has(doc.id) ? 'bg-blue-50/70' : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleDocumentSelection(doc.id)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                          selectedDocumentIds.has(doc.id)
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-300 bg-white text-transparent hover:border-blue-400'
                        }`}
                        aria-label={`${selectedDocumentIds.has(doc.id) ? 'Remover' : 'Selecionar'} arquivo ${doc.titulo}`}
                        aria-pressed={selectedDocumentIds.has(doc.id)}
                      >
                        <Check size={12} strokeWidth={3} />
                      </button>
                      <LibraryFileThumbnail
                        file={{
                          fileType: doc.tipo_arquivo,
                          title: doc.titulo,
                          url: doc.arquivo_url,
                        }}
                        className="h-12 !w-12 shrink-0 rounded-lg"
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-[#001a33] truncate">{doc.titulo}</h4>
                        <p className="text-[10px] text-slate-450 truncate">{doc.descricao || 'Sem descrição.'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] text-slate-400 font-mono font-bold hidden sm:inline mr-2">{doc.tamanho}</span>
                      <button 
                        onClick={() => handleOpenPreview(doc)}
                        className="p-2 bg-slate-50 hover:bg-blue-50 text-slate-450 hover:text-blue-600 border border-slate-100 rounded-lg transition-all"
                        title="Visualizar"
                      >
                        <Eye size={14} />
                      </button>
                      <a 
                        href={isLibraryUrl(doc.arquivo_url) ? doc.arquivo_url : undefined}
                        download={isLibraryUrl(doc.arquivo_url) ? doc.titulo : undefined}
                        onClick={(e) => {
                          if (!isLibraryUrl(doc.arquivo_url)) {
                            e.preventDefault();
                            alert('Download simulado indisponível.');
                          }
                        }}
                        className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-655 border border-slate-100 rounded-lg flex items-center justify-center"
                        title="Baixar"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      </div> : null}

      {/* Preview Modal */}
      <QuickPreviewModal 
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />
    </div>
  );
};

export default BibliotecaPage;

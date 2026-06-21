import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { 
  BookOpen, Folder, FolderOpen, FileText, Download, 
  Search, LayoutGrid, List, ChevronRight, Eye, Sparkles, Clock
} from 'lucide-react';
import QuickPreviewModal from '../../gestor/biblioteca/components/QuickPreviewModal';
import { LibraryDocument } from '../../gestor/biblioteca/biblioteca.types';

interface BibliotecaPageProps {
  alunoId: string;
}

const BibliotecaPage: React.FC<BibliotecaPageProps> = ({ alunoId }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; nome: string }>>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  // Preview State
  const [previewDoc, setPreviewDoc] = useState<LibraryDocument | null>(null);

  // 1. Busca as matrículas ativas do aluno para obter seus cursos, turmas e polos
  const { data: matriculas = [], isLoading: loadingMatriculas } = useQuery<any[]>({
    queryKey: ['aluno-biblioteca-matriculas', alunoId],
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

  const activeMatricula = matriculas[0];
  const cursoId = activeMatricula?.turmas?.cursos?.id;
  const turmaId = activeMatricula?.turma_id;
  const poloId = activeMatricula?.polo_id;

  // 2. Busca os professores vinculados às turmas do aluno
  const { data: activeTeachers = [] } = useQuery<any[]>({
    queryKey: ['aluno-biblioteca-professores', matriculas],
    queryFn: async () => {
      const activeTurmaIds = matriculas.map(m => m.turma_id).filter(Boolean);
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

  const teacherIds = activeTeachers.map(at => at.professor_id).filter(Boolean);

  // 3. Busca pastas reais da biblioteca (Gestão + Seus Professores)
  const { data: dbFolders = [], isLoading: loadingFolders } = useQuery<any[]>({
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

      // Se for a raiz, filtra apenas pastas institucionais (teacher_id = null) ou dos professores do aluno
      if (selectedFolderId === null && data) {
        return data.filter((f: any) => f.teacher_id === null || teacherIds.includes(f.teacher_id));
      }
      return data || [];
    }
  });

  // 4. Busca os documentos reais da biblioteca
  const { data: dbDocs = [], isLoading: loadingDocs } = useQuery<any[]>({
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
      return data || [];
    }
  });

  // 5. Filtro avançado de documentos com base nas regras de liberação do aluno
  const filteredDocuments = (dbDocs || []).filter((doc: any) => {
    // Regra 1: Público Alvo deve ser ALUNOS ou TODOS
    const matchAudience = doc.publico_alvo === 'ALUNOS' || doc.publico_alvo === 'TODOS';
    if (!matchAudience) return false;

    // Regra 2: Polo do Aluno
    if (doc.abrangencia === 'POLO_ESPECIFICO' && doc.polo_id && doc.polo_id !== poloId) {
      return false;
    }

    // Regra 3: Se foi criado por professor, deve ser um professor do aluno
    if (doc.teacher_id && !teacherIds.includes(doc.teacher_id)) {
      return false;
    }

    // Regra 4: Filtro de Cursos específicos
    if (doc.curso_ids && doc.curso_ids.length > 0 && cursoId && !doc.curso_ids.includes(cursoId)) {
      return false;
    }

    // Regra 5: Filtro de Turmas específicas
    if (doc.turma_ids && doc.turma_ids.length > 0 && turmaId && !doc.turma_ids.includes(turmaId)) {
      return false;
    }

    // Regra 6: Agendamento Temporal (se liberacao_tipo for POR_DATA)
    if (doc.liberacao_tipo === 'POR_DATA' && doc.liberacao_data) {
      if (new Date() < new Date(doc.liberacao_data)) {
        return false;
      }
    }

    // Filtro de pesquisa digitado
    const matchSearch = doc.titulo.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        (doc.descricao && doc.descricao.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchSearch;
  });

  const handleOpenFolder = (folder: any) => {
    setSelectedFolderId(folder.id);
    setBreadcrumbs([...breadcrumbs, { id: folder.id, nome: folder.nome }]);
  };

  const handleBreadcrumbClick = (folderId: string | null, index: number) => {
    setSelectedFolderId(folderId);
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

  const getFileIcon = (type: string) => {
    switch(type) {
        case 'PDF': return <div className="w-10 h-10 rounded-lg bg-red-50 text-red-650 flex items-center justify-center font-bold text-xs border border-red-100 shrink-0">PDF</div>;
        case 'DOC': return <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-650 flex items-center justify-center font-bold text-xs border border-blue-100 shrink-0">DOC</div>;
        case 'XLS': return <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-650 flex items-center justify-center font-bold text-xs border border-emerald-100 shrink-0">XLS</div>;
        default: return <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-655 flex items-center justify-center font-bold text-xs border border-slate-100 shrink-0">FILE</div>;
    }
  };

  const isLoading = loadingMatriculas || loadingFolders || loadingDocs;

  return (
    <div className="space-y-6 animate-fadeIn text-xs font-sans">
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

      {isLoading ? (
        <div className="py-20 text-center text-slate-400 font-bold uppercase tracking-wider animate-pulse">
          Buscando acervo digital...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Folders Row */}
          {dbFolders.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Pastas de Apoio</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {dbFolders.map(folder => (
                  <div 
                    key={folder.id}
                    onClick={() => handleOpenFolder(folder)}
                    className="p-4 bg-white border border-slate-150 rounded-2xl hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer flex items-center gap-3"
                  >
                    <div className="p-2.5 bg-blue-50 text-blue-650 rounded-xl">
                      <Folder size={18} />
                    </div>
                    <span className="font-bold text-[#001a33] truncate leading-tight">{folder.nome}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                    className="bg-white border border-slate-150 rounded-[2rem] p-5 shadow-sm flex flex-col justify-between hover:shadow-lg hover:border-blue-300 transition-all h-full"
                  >
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        {getFileIcon(doc.tipo_arquivo)}
                        <span className="text-[9px] font-bold text-slate-400 font-mono">{doc.tamanho}</span>
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
                        href={doc.arquivo_url === '#' ? undefined : doc.arquivo_url}
                        download={doc.titulo}
                        onClick={(e) => {
                          if (doc.arquivo_url === '#') {
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
                  <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(doc.tipo_arquivo)}
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
                        href={doc.arquivo_url === '#' ? undefined : doc.arquivo_url}
                        download={doc.titulo}
                        onClick={(e) => {
                          if (doc.arquivo_url === '#') {
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

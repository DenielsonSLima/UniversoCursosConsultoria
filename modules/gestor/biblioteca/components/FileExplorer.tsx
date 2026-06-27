// File: modules/gestor/biblioteca/components/FileExplorer.tsx

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Folder, FolderPlus, ArrowUp, ChevronRight, 
  Trash2, Edit, FolderOpen, ArrowRight, Eye, Download,
  Copy, Lock
} from 'lucide-react';
import { bibliotecaService } from '../biblioteca.service';
import { TargetAudience, LibraryFolder, LibraryDocument } from '../biblioteca.types';
import DocumentPermissionsModal from './DocumentPermissionsModal';
import { useFileExplorerQueries } from '../hooks/useFileExplorerQueries';
import { useFileExplorerMutations } from '../hooks/useFileExplorerMutations';
import { useFileExplorerRealtime } from '../hooks/useFileExplorerRealtime';

interface FileExplorerProps {
  teacherId?: string | null;
  onPreviewClick: (doc: LibraryDocument) => void;
  onNewUploadClick?: (pastaId: string | null) => void;
  readOnly?: boolean;
  allowedAudiences?: TargetAudience[];
}

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  teacherId = null, 
  onPreviewClick,
  onNewUploadClick,
  readOnly = false,
  allowedAudiences
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; nome: string }>>([]);

  // Modais e Diálogos
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  const [renamingFolder, setRenamingFolder] = useState<LibraryFolder | null>(null);
  const [renamedName, setRenamedName] = useState('');

  const [movingItem, setMovingItem] = useState<{ id: string; type: 'folder' | 'document' } | null>(null);
  const [actionType, setActionType] = useState<'move' | 'copy'>('move');
  const [permissionsDoc, setPermissionsDoc] = useState<LibraryDocument | null>(null);

  const {
    folders,
    documents,
    allFolders,
    isFoldersLoading,
    isDocsLoading,
  } = useFileExplorerQueries(teacherId, currentFolderId, !!movingItem);

  const filteredDocs = allowedAudiences 
    ? documents.filter(d => allowedAudiences.includes(d.targetAudience))
    : documents;

  const {
    createFolderMutation,
    renameFolderMutation,
    deleteFolderMutation,
    deleteDocumentMutation,
    moveFolderMutation,
    moveDocumentMutation,
    copyDocumentMutation,
    invalidateDocuments,
  } = useFileExplorerMutations({
    currentFolderId,
    teacherId,
    onFolderCreated: () => {
      setIsNewFolderOpen(false);
      setNewFolderName('');
    },
    onFolderRenamed: () => {
      setRenamingFolder(null);
      setRenamedName('');
    },
    onMoveFinished: () => {
      setMovingItem(null);
    }
  });

  useFileExplorerRealtime();

  // Navigate into a folder
  const handleOpenFolder = (folder: LibraryFolder) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs([...breadcrumbs, { id: folder.id, nome: folder.nome }]);
  };

  // Breadcrumb navigation click
  const handleBreadcrumbClick = (folderId: string | null, index: number) => {
    setCurrentFolderId(folderId);
    if (folderId === null) {
      setBreadcrumbs([]);
    } else {
      setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    }
  };

  // Actions
  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      createFolderMutation.mutate(newFolderName.trim());
    }
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingFolder && renamedName.trim()) {
      renameFolderMutation.mutate({ id: renamingFolder.id, nome: renamedName.trim() });
    }
  };

  const handleConfirmMove = (targetId: string | null) => {
    if (!movingItem) return;
    if (actionType === 'copy') {
      copyDocumentMutation.mutate({ id: movingItem.id, targetId });
    } else {
      if (movingItem.type === 'folder') {
        if (targetId === movingItem.id) {
          alert('Uma pasta não pode ser movida para ela mesma!');
          return;
        }
        moveFolderMutation.mutate({ id: movingItem.id, targetId });
      } else {
        moveDocumentMutation.mutate({ id: movingItem.id, targetId });
      }
    }
  };

  const getFileIcon = (type: string) => {
    switch(type) {
        case 'PDF': return <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs border border-red-100 shrink-0">PDF</div>;
        case 'DOC': return <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100 shrink-0">DOC</div>;
        case 'XLS': return <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs border border-emerald-100 shrink-0">XLS</div>;
        default: return <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center font-bold text-xs border border-slate-100 shrink-0">FILE</div>;
    }
  };

  const isContentLoading = isFoldersLoading || isDocsLoading;

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Explorer Header / Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-4 rounded-3xl border border-slate-150">
        {/* Breadcrumbs */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-wider">
          <button 
            onClick={() => handleBreadcrumbClick(null, -1)}
            className="hover:text-[#001a33] transition-colors"
          >
            Raiz
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

        {/* Buttons */}
        {!readOnly && onNewUploadClick && (
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              onClick={() => setIsNewFolderOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
            >
              <FolderPlus size={14} /> Nova Pasta
            </button>
            <button 
              onClick={() => onNewUploadClick(currentFolderId)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/10"
            >
              <ArrowUp size={14} /> Enviar Arquivo
            </button>
          </div>
        )}
      </div>

      {/* Explorer Grid */}
      {isContentLoading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">
          Navegando na biblioteca...
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Folders Section */}
          {folders.length > 0 && (
            <div className="space-y-3">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Pastas</span>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {folders.map((folder) => (
                  <div 
                    key={folder.id}
                    className="p-4 bg-white border border-slate-150 rounded-2xl hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-between group"
                  >
                    <div 
                      onClick={() => handleOpenFolder(folder)}
                      className="flex items-center gap-3 cursor-pointer flex-1 mr-2"
                    >
                      <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                        <Folder size={18} />
                      </div>
                      <span className="text-xs font-bold text-[#001a33] truncate leading-tight">{folder.nome}</span>
                    </div>

                    {/* Folder actions dropdown/buttons */}
                    {!readOnly && (
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => {
                            setRenamingFolder(folder);
                            setRenamedName(folder.nome);
                          }}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded"
                          title="Renomear"
                        >
                          <Edit size={12} />
                        </button>
                        <button 
                          onClick={() => setMovingItem({ id: folder.id, type: 'folder' })}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded"
                          title="Mover"
                        >
                          <ArrowRight size={12} />
                        </button>
                        <button 
                          onClick={() => {
                            if (confirm('Tem certeza que deseja excluir esta pasta e todos os seus arquivos?')) {
                              deleteFolderMutation.mutate(folder.id);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-50 rounded"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Files Section */}
          <div className="space-y-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Arquivos</span>
            
            {filteredDocs.length === 0 && folders.length === 0 ? (
              <div className="p-12 text-center bg-slate-50 border border-dashed border-slate-200 rounded-[2rem] text-slate-400 space-y-2">
                <FolderOpen size={32} className="mx-auto text-slate-350" />
                <h4 className="font-bold text-xs uppercase tracking-wider">Diretório Vazio</h4>
                <p className="text-[10px] text-slate-400 leading-relaxed font-medium">Esta pasta não contém arquivos ou subpastas publicadas.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredDocs.map((doc) => (
                  <div 
                    key={doc.id}
                    className="p-5 bg-white border border-slate-150 rounded-[2rem] hover:shadow-xl hover:shadow-blue-900/5 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between h-full group relative"
                  >
                    <div className="flex justify-between items-start mb-4">
                      {getFileIcon(doc.fileType)}
                      <span className="bg-slate-50 border border-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded text-[8px] tracking-wider uppercase">
                        {doc.targetAudience}
                      </span>
                    </div>

                    <div className="mb-6 space-y-1">
                      <h4 className="font-bold text-[#001a33] text-sm leading-snug line-clamp-2" title={doc.title}>{doc.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 min-h-[2.5em]">{doc.description || 'Sem descrição.'}</p>
                    </div>

                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        {doc.size} • {doc.acessos} views
                      </div>
                      
                      <div className="flex gap-1">
                        <button 
                          onClick={() => {
                            bibliotecaService.incrementAcessos(doc.id);
                            onPreviewClick(doc);
                          }}
                          className="p-2 bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors border border-slate-100"
                          title="Visualização Rápida"
                        >
                          <Eye size={14} />
                        </button>
                        <a
                          href={!doc.url || doc.url === '#' ? undefined : doc.url}
                          download={doc.title}
                          onClick={(e) => {
                            if (!doc.url || doc.url === '#') {
                              e.preventDefault();
                              alert('Download não disponível.');
                            } else {
                              bibliotecaService.incrementAcessos(doc.id);
                            }
                          }}
                          className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors border border-slate-100 flex items-center justify-center"
                          title="Baixar Arquivo"
                        >
                          <Download size={14} />
                        </a>
                        {!readOnly && (
                          <>
                            <button 
                              onClick={() => {
                                setMovingItem({ id: doc.id, type: 'document' });
                                setActionType('copy');
                              }}
                              className="p-2 bg-slate-50 hover:bg-purple-50 text-slate-400 hover:text-purple-600 rounded-lg transition-colors border border-slate-100"
                              title="Copiar"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={() => {
                                setMovingItem({ id: doc.id, type: 'document' });
                                setActionType('move');
                              }}
                              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 rounded-lg transition-colors border border-slate-100"
                              title="Mover"
                            >
                              <ArrowRight size={14} />
                            </button>
                            <button 
                              onClick={() => setPermissionsDoc(doc)}
                              className="p-2 bg-slate-50 hover:bg-amber-50 text-slate-450 hover:text-amber-600 rounded-lg transition-colors border border-slate-100"
                              title="Regras de Liberação"
                            >
                              <Lock size={14} />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Deseja excluir permanentemente este documento?')) {
                                  deleteDocumentMutation.mutate(doc.id);
                                }
                              }}
                              className="p-2 bg-slate-50 hover:bg-rose-50 text-slate-400 hover:text-rose-650 rounded-lg transition-colors border border-slate-100"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* MODAL: NOVA PASTA */}
      {isNewFolderOpen && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm" onClick={() => setIsNewFolderOpen(false)}></div>
          <div className="relative bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-fadeIn">
            <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-4">Criar Nova Pasta</h4>
            <form onSubmit={handleCreateFolderSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Nome da pasta..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 text-sm"
                required
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsNewFolderOpen(false)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: RENOMEAR PASTA */}
      {renamingFolder && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm" onClick={() => setRenamingFolder(null)}></div>
          <div className="relative bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-fadeIn">
            <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight mb-4">Renomear Pasta</h4>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <input
                type="text"
                placeholder="Novo nome..."
                value={renamedName}
                onChange={(e) => setRenamedName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 text-sm"
                required
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setRenamingFolder(null)}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider"
                >
                  Renomear
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: MOVER OU COPIAR ITEM */}
      {movingItem && typeof window !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm" onClick={() => setMovingItem(null)}></div>
          <div className="relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-fadeIn space-y-4">
            <div>
              <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">
                {actionType === 'move' ? 'Mover' : 'Copiar'} {movingItem.type === 'folder' ? 'Pasta' : 'Documento'}
              </h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                {actionType === 'move' 
                  ? 'Selecione o diretório de destino na estrutura de arquivos.' 
                  : 'Selecione a pasta de destino para criar a cópia.'}
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-150 rounded-2xl divide-y divide-slate-100 custom-scrollbar">
              {/* Opção de Mover para Raiz */}
              <button
                onClick={() => handleConfirmMove(null)}
                className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-black text-blue-600 flex justify-between items-center"
              >
                <span>{actionType === 'move' ? 'Raiz (Diretório Principal)' : 'Copiar para a Raiz'}</span>
                <ChevronRight size={14} />
              </button>
              
              {/* Pastas Disponíveis */}
              {allFolders.map(folder => (
                <button
                  key={folder.id}
                  onClick={() => handleConfirmMove(folder.id)}
                  className="w-full text-left p-3.5 hover:bg-slate-50 text-xs font-bold text-slate-700 flex justify-between items-center"
                >
                  <span className="flex items-center gap-2"><Folder size={14} className="text-blue-500" /> {folder.nome}</span>
                  <ChevronRight size={14} className="text-slate-350" />
                </button>
              ))}

              {allFolders.length === 0 && (
                <div className="p-6 text-center text-slate-400 text-xs">Nenhuma pasta disponível. Mova para a Raiz.</div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button 
                onClick={() => setMovingItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: CONFIGURAR PERMISSÕES / LIBERAÇÃO */}
      <DocumentPermissionsModal
        isOpen={!!permissionsDoc}
        onClose={() => setPermissionsDoc(null)}
        document={permissionsDoc}
        onSave={() => {
          invalidateDocuments();
          setPermissionsDoc(null);
        }}
      />

    </div>
  );
};

export default FileExplorer;

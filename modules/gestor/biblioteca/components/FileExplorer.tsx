// File: modules/gestor/biblioteca/components/FileExplorer.tsx

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Folder, FolderPlus, ArrowUp, ChevronRight, 
  Trash2, Edit, FolderOpen, ArrowRight, Eye, Download,
  Copy, Lock, Search, Check
} from 'lucide-react';
import { bibliotecaService } from '../biblioteca.service';
import { TargetAudience, LibraryFolder, LibraryDocument } from '../biblioteca.types';
import DocumentPermissionsModal from './DocumentPermissionsModal';
import LibraryFileThumbnail from './file-preview/LibraryFileThumbnail';
import FinderFolderIcon from './file-explorer/FinderFolderIcon';
import LibrarySelectionToolbar from './LibrarySelectionToolbar';
import {
  downloadLibrarySelectionAsZip,
  downloadSingleLibraryFile
} from '../../../shared/library/library-download';
import { useFileExplorerQueries } from '../hooks/useFileExplorerQueries';
import { useFileExplorerMutations } from '../hooks/useFileExplorerMutations';
import { useFileExplorerRealtime } from '../hooks/useFileExplorerRealtime';
import ConfirmModal from '../../components/ConfirmModal';
import ToastNotification, { useToast } from '../../components/ToastNotification';

interface FileExplorerProps {
  teacherId?: string | null;
  onPreviewClick: (doc: LibraryDocument) => void;
  onNewUploadClick?: (pastaId: string | null) => void;
  readOnly?: boolean;
  allowedAudiences?: TargetAudience[];
  restrictPermissionsToTeacherScope?: boolean;
}

type PendingDeletion =
  | { type: 'folder'; id: string; name: string }
  | { type: 'document'; id: string; name: string };

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  teacherId = null, 
  onPreviewClick,
  onNewUploadClick,
  readOnly = false,
  allowedAudiences,
  restrictPermissionsToTeacherScope = false
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
  const [pendingDeletion, setPendingDeletion] = useState<PendingDeletion | null>(null);
  const { toasts, removeToast, toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [isDownloadingSelection, setIsDownloadingSelection] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  const isFiltering = searchQuery.trim().length > 0 || fileTypeFilter !== 'all';

  const {
    folders,
    documents,
    allFolders,
    isFoldersLoading,
    isDocsLoading,
  } = useFileExplorerQueries(teacherId, currentFolderId, !!movingItem, isFiltering);

  const filteredDocs = (allowedAudiences 
    ? documents.filter(d => allowedAudiences.includes(d.targetAudience))
    : documents
  ).filter(doc => {
    if (searchQuery.trim().length > 0) {
      const lowerQuery = searchQuery.toLowerCase();
      const titleMatches = doc.title.toLowerCase().includes(lowerQuery);
      const descMatches = (doc.description || '').toLowerCase().includes(lowerQuery);
      if (!titleMatches && !descMatches) return false;
    }
    if (fileTypeFilter !== 'all') {
      if (doc.fileType !== fileTypeFilter) return false;
    }
    return true;
  });

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
    setSelectedFolderIds(new Set());
    setSelectedDocumentIds(new Set());
  };

  // Breadcrumb navigation click
  const handleBreadcrumbClick = (folderId: string | null, index: number) => {
    setCurrentFolderId(folderId);
    setSelectedFolderIds(new Set());
    setSelectedDocumentIds(new Set());
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
          toast.info('Destino inválido', 'Uma pasta não pode ser movida para ela mesma.');
          return;
        }
        moveFolderMutation.mutate({ id: movingItem.id, targetId });
      } else {
        moveDocumentMutation.mutate({ id: movingItem.id, targetId });
      }
    }
  };

  const handlePreviewDocument = (doc: LibraryDocument) => {
    bibliotecaService.incrementAcessos(doc.id);
    onPreviewClick(doc);
  };

  const handleConfirmDeletion = () => {
    if (!pendingDeletion) return;

    const item = pendingDeletion;
    const mutation = item.type === 'folder'
      ? deleteFolderMutation
      : deleteDocumentMutation;

    mutation.mutate(item.id, {
      onSuccess: () => {
        toast.success(
          item.type === 'folder' ? 'Pasta apagada' : 'Arquivo apagado',
          item.type === 'folder'
            ? `“${item.name}” e seus arquivos foram removidos da biblioteca e do armazenamento.`
            : `“${item.name}” foi removido da biblioteca e do armazenamento.`
        );
      },
      onError: (error) => {
        toast.error(
          'Não foi possível apagar',
          error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
        );
      }
    });
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
    setSelectedFolderIds(new Set(folders.map((folder) => folder.id)));
    setSelectedDocumentIds(new Set(filteredDocs.map((document) => document.id)));
  };

  const handleDownloadSelection = async () => {
    const folderIds = Array.from(selectedFolderIds) as string[];
    const documentIds = Array.from(selectedDocumentIds) as string[];
    const selectionCount = folderIds.length + documentIds.length;
    if (selectionCount === 0) return;

    if (folderIds.length === 0 && documentIds.length === 1) {
      const document = documents.find((item) => item.id === documentIds[0]);
      if (!document) return;

      try {
        await downloadSingleLibraryFile({
          id: document.id,
          folderId: document.pastaId || null,
          name: document.title,
          url: document.url,
          fileType: document.fileType,
          sizeBytes: document.sizeBytes
        });
        bibliotecaService.incrementAcessos(document.id);
        clearSelection();
      } catch (error) {
        toast.error(
          'Não foi possível baixar',
          error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
        );
      }
      return;
    }

    setIsDownloadingSelection(true);
    setDownloadProgress('Carregando a estrutura da biblioteca...');

    try {
      const [allFoldersForDownload, allDocumentsForDownload] = await Promise.all([
        bibliotecaService.getFoldersForMove(teacherId),
        bibliotecaService.getDocuments({ teacherId })
      ]);

      await downloadLibrarySelectionAsZip({
        selectedFolderIds: folderIds,
        selectedDocumentIds: documentIds,
        folders: allFoldersForDownload.map((folder) => ({
          id: folder.id,
          name: folder.nome,
          parentId: folder.parent_id
        })),
        documents: allDocumentsForDownload
          .filter((document) => !allowedAudiences || allowedAudiences.includes(document.targetAudience))
          .map((document) => ({
            id: document.id,
            folderId: document.pastaId || null,
            name: document.title,
            url: document.url,
            fileType: document.fileType,
            sizeBytes: document.sizeBytes
          })),
        archiveName: breadcrumbs.at(-1)?.nome || 'biblioteca',
        onProgress: setDownloadProgress
      });

      clearSelection();
    } catch (error) {
      toast.error(
        'Não foi possível preparar o ZIP',
        error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
      );
    } finally {
      setIsDownloadingSelection(false);
      setDownloadProgress('');
    }
  };

  const selectionCount = selectedFolderIds.size + selectedDocumentIds.size;
  const isContentLoading = isFoldersLoading || isDocsLoading;

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Merged Toolbar */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-white p-4 rounded-3xl border border-slate-150 shadow-sm">
        {/* Left Section: Breadcrumbs or Search Results Status */}
        <div className="w-full lg:w-auto flex flex-wrap items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-wider">
          {isFiltering ? (
            <div className="text-xs font-black text-blue-600 uppercase tracking-wider flex flex-wrap items-center gap-2">
              <span>Busca global ativa</span>
              {searchQuery && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[10px] normal-case font-bold">"{searchQuery}"</span>}
              {fileTypeFilter !== 'all' && <span className="bg-purple-50 text-purple-600 px-2 py-0.5 rounded text-[10px] normal-case font-bold">Tipo: {fileTypeFilter}</span>}
            </div>
          ) : (
            <>
              <button 
                onClick={() => handleBreadcrumbClick(null, -1)}
                className="hover:text-[#001a33] transition-colors"
              >
                Raiz
              </button>
              
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  <ChevronRight size={12} className="text-slate-350" />
                  <button 
                    onClick={() => handleBreadcrumbClick(crumb.id, idx)}
                    className={`hover:text-[#001a33] transition-colors ${idx === breadcrumbs.length - 1 ? 'text-[#001a33] font-black' : ''}`}
                  >
                    {crumb.nome}
                  </button>
                </React.Fragment>
              ))}
            </>
          )}
        </div>

        {/* Right Section: Filters & Action Buttons */}
        <div className="w-full lg:w-auto flex flex-wrap lg:flex-nowrap items-center justify-end gap-3 flex-1">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md w-full">
            <div className="flex items-center bg-slate-50 rounded-xl px-3.5 py-2 border border-slate-150 focus-within:border-blue-500 focus-within:bg-white transition-all">
              <Search size={16} className="text-slate-400 mr-2 shrink-0" />
              <input 
                type="text"
                placeholder="Buscar em todas as pastas..."
                className="bg-transparent border-none outline-none w-full text-sm font-medium text-slate-800 placeholder-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* File Type Select */}
          <div className="shrink-0 w-full sm:w-auto flex gap-2">
            <select 
              value={fileTypeFilter}
              onChange={(e) => setFileTypeFilter(e.target.value)}
              className="w-full sm:w-44 px-3 py-2 bg-slate-50 border border-slate-150 rounded-xl text-sm font-medium text-slate-800 outline-none cursor-pointer focus:border-blue-500 focus:bg-white transition-all"
            >
              <option value="all">Todos os tipos</option>
              <option value="PDF">PDF</option>
              <option value="DOC">Word</option>
              <option value="XLS">Excel</option>
              <option value="PPT">PowerPoint</option>
              <option value="IMG">Imagens</option>
              <option value="VIDEO">Vídeos</option>
              <option value="OTHER">Outros formatos</option>
            </select>

            {isFiltering && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFileTypeFilter('all');
                }}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-150 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Action Buttons (Hidden when searching/filtering) */}
          {!readOnly && onNewUploadClick && !isFiltering && (
            <div className="flex gap-2 shrink-0 w-full sm:w-auto">
              <button 
                onClick={() => setIsNewFolderOpen(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-650 hover:text-blue-600 hover:border-blue-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
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

      {/* Explorer Grid */}
      {isContentLoading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">
          Navegando na biblioteca...
        </div>
      ) : (
        <div className="space-y-9">

          {/* Folders: Finder-style icon grid */}
          {folders.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pastas</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{folders.length}</span>
              </div>
              <div className="flex flex-wrap items-start gap-x-1 gap-y-4">
                {folders.map((folder) => (
                  <div 
                    key={folder.id}
                    className={`group relative w-[152px] shrink-0 rounded-2xl border px-3 pb-4 pt-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_28px_rgba(15,55,95,0.08)] focus-within:bg-white focus-within:shadow-[0_10px_28px_rgba(15,55,95,0.08)] active:bg-white ${
                      selectedFolderIds.has(folder.id)
                        ? 'border-blue-300 bg-white shadow-[0_10px_28px_rgba(37,99,235,0.12)]'
                        : 'border-transparent hover:border-slate-200 focus-within:border-blue-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleFolderSelection(folder.id)}
                      className={`absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                        selectedFolderIds.has(folder.id)
                          ? 'border-blue-600 bg-blue-600 text-white opacity-100'
                          : 'border-slate-300 bg-white/95 text-transparent opacity-60 hover:border-blue-400 hover:opacity-100'
                      }`}
                      aria-label={`${selectedFolderIds.has(folder.id) ? 'Remover' : 'Selecionar'} pasta ${folder.nome}`}
                      aria-pressed={selectedFolderIds.has(folder.id)}
                      title="Selecionar pasta"
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenFolder(folder)}
                      className="flex w-full min-w-0 flex-col items-center rounded-xl px-1 pb-1 pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title={`Abrir pasta ${folder.nome}`}
                    >
                      <div className="relative h-[80px] w-[96px] transition-transform duration-200 group-hover:scale-[1.04] group-active:scale-[0.98]">
                        <FinderFolderIcon className="h-full w-full object-contain drop-shadow-[0_5px_4px_rgba(14,116,165,0.16)]" />
                      </div>
                      <span className="mt-1 block min-h-[2.5em] w-full whitespace-normal break-words text-center text-xs font-bold leading-[1.25] text-[#001a33] [overflow-wrap:anywhere]">
                        {folder.nome}
                      </span>
                    </button>

                    {!readOnly && (
                      <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-lg border border-slate-100 bg-white/95 p-0.5 opacity-100 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                        <button 
                          onClick={() => {
                            setRenamingFolder(folder);
                            setRenamedName(folder.nome);
                          }}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                          title="Renomear"
                        >
                          <Edit size={12} />
                        </button>
                        <button 
                          onClick={() => setMovingItem({ id: folder.id, type: 'folder' })}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                          title="Mover"
                        >
                          <ArrowRight size={12} />
                        </button>
                        <button 
                          onClick={() => setPendingDeletion({
                            type: 'folder',
                            id: folder.id,
                            name: folder.nome
                          })}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          title="Apagar"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {filteredDocs.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Arquivos</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{filteredDocs.length}</span>
              </div>
              <div className="flex flex-wrap items-start gap-x-1 gap-y-4">
                {filteredDocs.map((doc) => (
                  <article
                    key={doc.id}
                    className={`group relative flex w-[184px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-white/60 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_28px_rgba(15,55,95,0.08)] focus-within:bg-white focus-within:shadow-[0_10px_28px_rgba(15,55,95,0.08)] active:bg-white ${
                      selectedDocumentIds.has(doc.id)
                        ? 'border-blue-300 bg-white shadow-[0_10px_28px_rgba(37,99,235,0.12)]'
                        : 'border-transparent hover:border-slate-200 focus-within:border-blue-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDocumentSelection(doc.id)}
                      className={`absolute left-2 top-2 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-all ${
                        selectedDocumentIds.has(doc.id)
                          ? 'border-blue-600 bg-blue-600 text-white opacity-100'
                          : 'border-slate-300 bg-white/95 text-transparent opacity-60 hover:border-blue-400 hover:opacity-100'
                      }`}
                      aria-label={`${selectedDocumentIds.has(doc.id) ? 'Remover' : 'Selecionar'} arquivo ${doc.title}`}
                      aria-pressed={selectedDocumentIds.has(doc.id)}
                      title="Selecionar arquivo"
                    >
                      <Check size={12} strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreviewDocument(doc)}
                      className="flex min-w-0 flex-1 flex-col items-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      title={`Visualizar ${doc.title}`}
                    >
                      <LibraryFileThumbnail
                        file={doc}
                        className="transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                      <h4 className="mt-2 line-clamp-3 min-h-[3.75em] w-full whitespace-normal break-words text-center text-xs font-bold leading-[1.25] text-[#001a33] [overflow-wrap:anywhere]" title={doc.title}>
                        {doc.title}
                      </h4>
                      <span className="mt-1 text-center text-[8px] font-black uppercase tracking-[0.12em] text-slate-400">
                        {doc.size} • {doc.acessos} acessos
                      </span>
                    </button>

                    <div className={`mt-2 grid w-full border-t border-slate-100 pt-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 ${
                      readOnly ? 'grid-cols-2 gap-1' : 'grid-cols-3 gap-1'
                    }`}>
                      <button
                        type="button"
                        onClick={() => handlePreviewDocument(doc)}
                        className="flex min-h-8 items-center justify-center rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                        title="Visualização rápida"
                      >
                        <Eye size={13} />
                      </button>
                        <a
                          href={!doc.url || doc.url === '#' ? undefined : doc.url}
                          download={doc.title}
                          onClick={(e) => {
                            if (!doc.url || doc.url === '#') {
                              e.preventDefault();
                              toast.info('Download indisponível', 'Este arquivo não possui um endereço válido para download.');
                            } else {
                              bibliotecaService.incrementAcessos(doc.id);
                            }
                          }}
                          className="flex min-h-8 items-center justify-center rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                          title="Baixar Arquivo"
                        >
                          <Download size={13} />
                        </a>
                        {!readOnly && (
                          <>
                            <button 
                              onClick={() => {
                                setMovingItem({ id: doc.id, type: 'document' });
                                setActionType('copy');
                              }}
                              className="flex min-h-8 items-center justify-center rounded-lg text-slate-400 hover:bg-purple-50 hover:text-purple-600"
                              title="Copiar"
                            >
                              <Copy size={13} />
                            </button>
                            <button 
                              onClick={() => {
                                setMovingItem({ id: doc.id, type: 'document' });
                                setActionType('move');
                              }}
                              className="flex min-h-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Mover"
                            >
                              <ArrowRight size={13} />
                            </button>
                            <button 
                              onClick={() => setPermissionsDoc(doc)}
                              className="flex min-h-8 items-center justify-center rounded-lg text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                              title="Regras de Liberação"
                            >
                              <Lock size={13} />
                            </button>
                            <button 
                              onClick={() => setPendingDeletion({
                                type: 'document',
                                id: doc.id,
                                name: doc.title
                              })}
                              className="flex min-h-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Apagar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {filteredDocs.length === 0 && folders.length === 0 && (
            <div className="space-y-2 rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-slate-400">
              {isFiltering ? (
                <>
                  <Search size={32} className="mx-auto text-slate-350" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Nenhum resultado encontrado</h4>
                  <p className="text-[10px] font-medium leading-relaxed text-slate-400">Nenhum arquivo corresponde aos critérios de busca selecionados.</p>
                </>
              ) : (
                <>
                  <FolderOpen size={32} className="mx-auto text-slate-350" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Diretório vazio</h4>
                  <p className="text-[10px] font-medium leading-relaxed text-slate-400">Esta pasta não contém arquivos ou subpastas publicadas.</p>
                </>
              )}
            </div>
          )}

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
        teacherScopeOnly={restrictPermissionsToTeacherScope}
        onSave={() => {
          invalidateDocuments();
          setPermissionsDoc(null);
        }}
      />

      <ConfirmModal
        isOpen={!!pendingDeletion}
        title="Confirmação"
        message={
          pendingDeletion?.type === 'folder'
            ? `Deseja realmente apagar a pasta “${pendingDeletion.name}” e todos os arquivos dentro dela?`
            : `Deseja realmente apagar o arquivo “${pendingDeletion?.name || ''}”?`
        }
        confirmText="Apagar"
        cancelText="Cancelar"
        variant="danger"
        onClose={() => setPendingDeletion(null)}
        onConfirm={handleConfirmDeletion}
      />

      <ToastNotification toasts={toasts} onRemove={removeToast} />

    </div>
  );
};

export default FileExplorer;

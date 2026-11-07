// File: modules/gestor/biblioteca/components/FileExplorer.tsx

import React, { useState } from 'react';
import { bibliotecaService } from '../biblioteca.service';
import { TargetAudience, LibraryFolder, LibraryDocument } from '../biblioteca.types';
import DocumentPermissionsModal from './DocumentPermissionsModal';
import LibrarySelectionToolbar from './LibrarySelectionToolbar';
import FileExplorerToolbar from './file-explorer/FileExplorerToolbar';
import FileExplorerItems from './file-explorer/FileExplorerItems';
import FileExplorerDialogs from './file-explorer/FileExplorerDialogs';
import './file-explorer/biblioteca-explorer.css';
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

const FOLDER_AUDIENCE_OPTIONS: Array<{ value: TargetAudience; label: string; description: string }> = [
  { value: 'INTERNO', label: 'Somente gestão', description: 'A pasta fica privada e não aparece nos outros portais.' },
  { value: 'ALUNOS', label: 'Alunos', description: 'A pasta aparece no acesso dos alunos autorizados.' },
  { value: 'PROFESSORES', label: 'Professores', description: 'A pasta aparece no acesso dos professores.' },
  { value: 'TODOS', label: 'Alunos e professores', description: 'A pasta aparece nos dois portais.' },
];

const isAudienceAllowedByParent = (
  parentAudience: TargetAudience | null,
  childAudience: TargetAudience,
): boolean => {
  if (!parentAudience || parentAudience === 'TODOS') return true;
  if (parentAudience === 'INTERNO') return childAudience === 'INTERNO';
  return childAudience === 'INTERNO' || childAudience === parentAudience;
};

const FileExplorer: React.FC<FileExplorerProps> = ({ 
  teacherId = null, 
  onPreviewClick,
  onNewUploadClick,
  readOnly = false,
  allowedAudiences,
  restrictPermissionsToTeacherScope = false
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; nome: string; targetAudience: TargetAudience }>>([]);

  // Modais e Diálogos
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderAudience, setNewFolderAudience] = useState<TargetAudience>('INTERNO');
  const [sharingFolder, setSharingFolder] = useState<LibraryFolder | null>(null);
  const [sharedAudience, setSharedAudience] = useState<TargetAudience>('INTERNO');
  
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
  const currentParentAudience = breadcrumbs.at(-1)?.targetAudience ?? null;
  const availableFolderAudienceOptions = FOLDER_AUDIENCE_OPTIONS.filter((option) => (
    (!teacherId || ['INTERNO', 'ALUNOS'].includes(option.value))
    && isAudienceAllowedByParent(currentParentAudience, option.value)
  ));

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
    updateFolderAudienceMutation,
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
      setNewFolderAudience('INTERNO');
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
    setBreadcrumbs([...breadcrumbs, {
      id: folder.id,
      nome: folder.nome,
      targetAudience: folder.targetAudience,
    }]);
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
      createFolderMutation.mutate({
        nome: newFolderName.trim(),
        targetAudience: newFolderAudience,
      });
    }
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (renamingFolder && renamedName.trim()) {
      renameFolderMutation.mutate({ id: renamingFolder.id, nome: renamedName.trim() });
    }
  };

  const handleSharingSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!sharingFolder) return;
    updateFolderAudienceMutation.mutate(
      { id: sharingFolder.id, targetAudience: sharedAudience },
      { onSuccess: () => setSharingFolder(null) },
    );
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

  const handleDownloadClick = (event: React.MouseEvent<HTMLElement>, doc: LibraryDocument) => {
    if (!doc.url || doc.url === '#') {
      event.preventDefault();
      toast.info('Download indisponível', 'Este arquivo não possui um endereço válido para download.');
    } else {
      bibliotecaService.incrementAcessos(doc.id);
    }
  };

  return (
    <div className="biblioteca-explorer space-y-6 animate-fadeIn">
      <FileExplorerToolbar
        breadcrumbs={breadcrumbs}
        isFiltering={isFiltering}
        searchQuery={searchQuery}
        fileTypeFilter={fileTypeFilter}
        readOnly={readOnly}
        canUpload={!!onNewUploadClick}
        onBreadcrumbClick={handleBreadcrumbClick}
        onSearchChange={setSearchQuery}
        onFileTypeChange={setFileTypeFilter}
        onClear={() => { setSearchQuery(''); setFileTypeFilter('all'); }}
        onCreateFolder={() => { setNewFolderAudience('INTERNO'); setIsNewFolderOpen(true); }}
        onUpload={() => onNewUploadClick?.(currentFolderId)}
      />
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
      <FileExplorerItems
        folders={folders}
        filteredDocs={filteredDocs}
        selectedFolderIds={selectedFolderIds}
        selectedDocumentIds={selectedDocumentIds}
        readOnly={readOnly}
        isFiltering={isFiltering}
        isContentLoading={isContentLoading}
        handleOpenFolder={handleOpenFolder}
        toggleFolderSelection={toggleFolderSelection}
        toggleDocumentSelection={toggleDocumentSelection}
        handlePreviewDocument={handlePreviewDocument}
        handleDownloadClick={handleDownloadClick}
        setSharingFolder={setSharingFolder}
        setSharedAudience={setSharedAudience}
        setRenamingFolder={setRenamingFolder}
        setRenamedName={setRenamedName}
        setMovingItem={setMovingItem}
        setActionType={setActionType}
        setPermissionsDoc={setPermissionsDoc}
        setPendingDeletion={setPendingDeletion}
      />
      <FileExplorerDialogs
        isNewFolderOpen={isNewFolderOpen}
        newFolderName={newFolderName}
        newFolderAudience={newFolderAudience}
        sharingFolder={sharingFolder}
        sharedAudience={sharedAudience}
        renamingFolder={renamingFolder}
        renamedName={renamedName}
        movingItem={movingItem}
        actionType={actionType}
        allFolders={allFolders}
        availableFolderAudienceOptions={availableFolderAudienceOptions}
        audienceOptions={FOLDER_AUDIENCE_OPTIONS}
        isSharingPending={updateFolderAudienceMutation.isPending}
        setIsNewFolderOpen={setIsNewFolderOpen}
        setNewFolderName={setNewFolderName}
        setNewFolderAudience={setNewFolderAudience}
        setSharingFolder={setSharingFolder}
        setSharedAudience={setSharedAudience}
        setRenamingFolder={setRenamingFolder}
        setRenamedName={setRenamedName}
        setMovingItem={setMovingItem}
        handleCreateFolderSubmit={handleCreateFolderSubmit}
        handleSharingSubmit={handleSharingSubmit}
        handleRenameSubmit={handleRenameSubmit}
        handleConfirmMove={handleConfirmMove}
      />
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

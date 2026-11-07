import React from 'react';
import { ArrowRight, Check, Copy, Download, Edit, Eye, FolderOpen, Lock, Search, Trash2 } from 'lucide-react';
import type { LibraryDocument, LibraryFolder } from '../../biblioteca.types';
import LibraryFileThumbnail from '../file-preview/LibraryFileThumbnail';
import LibraryFolderGrid from '../LibraryFolderGrid';

interface FileExplorerItemsProps {
  folders: LibraryFolder[];
  filteredDocs: LibraryDocument[];
  selectedFolderIds: Set<string>;
  selectedDocumentIds: Set<string>;
  readOnly: boolean;
  isFiltering: boolean;
  isContentLoading: boolean;
  handleOpenFolder: (folder: LibraryFolder) => void;
  toggleFolderSelection: (id: string) => void;
  toggleDocumentSelection: (id: string) => void;
  handlePreviewDocument: (document: LibraryDocument) => void;
  handleDownloadClick: (event: React.MouseEvent<HTMLElement>, document: LibraryDocument) => void;
  setSharingFolder: (folder: LibraryFolder) => void;
  setSharedAudience: (audience: LibraryFolder['targetAudience']) => void;
  setRenamingFolder: (folder: LibraryFolder) => void;
  setRenamedName: (name: string) => void;
  setMovingItem: (item: { id: string; type: 'folder' | 'document' }) => void;
  setActionType: (type: 'move' | 'copy') => void;
  setPermissionsDoc: (document: LibraryDocument) => void;
  setPendingDeletion: (item: { id: string; type: 'folder' | 'document'; name: string }) => void;
}

export default function FileExplorerItems({
  folders, filteredDocs, selectedFolderIds, selectedDocumentIds, readOnly, isFiltering,
  isContentLoading, handleOpenFolder, toggleFolderSelection, toggleDocumentSelection,
  handlePreviewDocument, handleDownloadClick, setSharingFolder, setSharedAudience,
  setRenamingFolder, setRenamedName, setMovingItem, setActionType, setPermissionsDoc,
  setPendingDeletion,
}: FileExplorerItemsProps) {
  return (
    <>
      {isContentLoading ? (
        <div className="py-20 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">
          Navegando na biblioteca...
        </div>
      ) : (
        <div className="biblioteca-explorer-items">

          <LibraryFolderGrid
            folders={folders}
            selectedIds={selectedFolderIds}
            onOpen={handleOpenFolder}
            onToggle={toggleFolderSelection}
            showAudience={!readOnly}
            renderActions={readOnly ? undefined : (folder) => (
              <div className="absolute right-1.5 top-1.5 flex gap-0.5 rounded-lg border border-slate-100 bg-white/95 p-0.5 opacity-100 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <button onClick={() => { setSharingFolder(folder); setSharedAudience(folder.targetAudience); }} className="rounded-md p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Compartilhamento"><Lock size={12} /></button>
                <button onClick={() => { setRenamingFolder(folder); setRenamedName(folder.nome); }} className="rounded-md p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600" title="Renomear"><Edit size={12} /></button>
                <button onClick={() => setMovingItem({ id: folder.id, type: 'folder' })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700" title="Mover"><ArrowRight size={12} /></button>
                <button onClick={() => setPendingDeletion({ type: 'folder', id: folder.id, name: folder.nome })} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Apagar"><Trash2 size={12} /></button>
              </div>
            )}
          />

          {filteredDocs.length > 0 && (
            <section className="biblioteca-explorer-files">
              <div className="flex items-center gap-3 px-1">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Arquivos</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{filteredDocs.length}</span>
              </div>
              <div className="biblioteca-explorer-file-grid">
                {filteredDocs.map((doc) => (
                  <article
                    key={doc.id}
                    className={`biblioteca-explorer-file group relative flex w-[184px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-white/60 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_28px_rgba(15,55,95,0.08)] focus-within:bg-white focus-within:shadow-[0_10px_28px_rgba(15,55,95,0.08)] active:bg-white ${
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
                          onClick={(event) => handleDownloadClick(event, doc)}
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
            <div className="biblioteca-explorer-empty space-y-2 rounded-[2rem] border border-dashed border-slate-200 bg-slate-50 p-12 text-center text-slate-400">
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

    </>
  );
}

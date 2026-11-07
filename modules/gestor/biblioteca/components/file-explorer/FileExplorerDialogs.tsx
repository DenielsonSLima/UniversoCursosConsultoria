import React from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Folder, Lock } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { LibraryFolder, TargetAudience } from '../../biblioteca.types';

interface FileExplorerDialogsProps {
  isNewFolderOpen: boolean;
  newFolderName: string;
  newFolderAudience: TargetAudience;
  sharingFolder: LibraryFolder | null;
  sharedAudience: TargetAudience;
  renamingFolder: LibraryFolder | null;
  renamedName: string;
  movingItem: { id: string; type: 'folder' | 'document' } | null;
  actionType: 'move' | 'copy';
  allFolders: Array<Pick<LibraryFolder, 'id' | 'nome'>>;
  availableFolderAudienceOptions: Array<{ value: TargetAudience; label: string }>;
  audienceOptions: Array<{ value: TargetAudience; description: string }>;
  isSharingPending: boolean;
  setIsNewFolderOpen: (open: boolean) => void;
  setNewFolderName: (name: string) => void;
  setNewFolderAudience: (audience: TargetAudience) => void;
  setSharingFolder: (folder: LibraryFolder | null) => void;
  setSharedAudience: (audience: TargetAudience) => void;
  setRenamingFolder: (folder: LibraryFolder | null) => void;
  setRenamedName: (name: string) => void;
  setMovingItem: (item: { id: string; type: 'folder' | 'document' } | null) => void;
  handleCreateFolderSubmit: (event: React.FormEvent) => void;
  handleSharingSubmit: (event: React.FormEvent) => void;
  handleRenameSubmit: (event: React.FormEvent) => void;
  handleConfirmMove: (id: string | null) => void;
}

export default function FileExplorerDialogs({
  isNewFolderOpen, newFolderName, newFolderAudience, sharingFolder, sharedAudience,
  renamingFolder, renamedName, movingItem, actionType, allFolders,
  availableFolderAudienceOptions, audienceOptions, isSharingPending,
  setIsNewFolderOpen, setNewFolderName, setNewFolderAudience, setSharingFolder,
  setSharedAudience, setRenamingFolder, setRenamedName, setMovingItem,
  handleCreateFolderSubmit, handleSharingSubmit, handleRenameSubmit, handleConfirmMove,
}: FileExplorerDialogsProps) {
  return (
    <>
      {/* MODAL: NOVA PASTA */}
      {isNewFolderOpen && typeof window !== 'undefined' && createPortal(
        <div className="biblioteca-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60" onClick={() => setIsNewFolderOpen(false)}></div>
          <div role="dialog" aria-modal="true" aria-label="Pasta" className="biblioteca-dialog biblioteca-explorer-dialog relative bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-fadeIn">
            <h4 className="biblioteca-dialog-header text-lg font-black text-[#001a33] uppercase tracking-tight mb-4">Criar Nova Pasta</h4>
            <form onSubmit={handleCreateFolderSubmit} className="biblioteca-dialog-body space-y-4">
              <input
                type="text"
                placeholder="Nome da pasta..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 text-sm"
                required
                autoFocus
              />
              <div className="space-y-2">
                <label htmlFor="new-folder-audience" className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
                  Quem pode ver esta pasta?
                </label>
                <InstitutionalSelect
                  id="new-folder-audience"
                  ariaLabel="Quem pode ver esta pasta?"
                  value={newFolderAudience}
                  onValueChange={value => setNewFolderAudience(value as TargetAudience)}
                  options={availableFolderAudienceOptions}
                  allowClear={false}
                />
                <p className="text-[10px] font-medium leading-relaxed text-slate-500">
                  {audienceOptions.find((option) => option.value === newFolderAudience)?.description}
                </p>
              </div>
              <div className="biblioteca-dialog-footer flex justify-end gap-2">
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

      {/* MODAL: COMPARTILHAMENTO DA PASTA */}
      {sharingFolder && typeof window !== 'undefined' && createPortal(
        <div className="biblioteca-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60" onClick={() => setSharingFolder(null)} />
          <div role="dialog" aria-modal="true" aria-label="Compartilhar pasta" className="biblioteca-dialog biblioteca-explorer-dialog relative w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl animate-fadeIn">
            <div className="biblioteca-dialog-header mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600"><Lock size={19} /></div>
              <div className="min-w-0">
                <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Compartilhar Pasta</h4>
                <p className="truncate text-xs font-semibold text-slate-500">{sharingFolder.nome}</p>
              </div>
            </div>
            <form onSubmit={handleSharingSubmit} className="biblioteca-dialog-body space-y-4">
              <div className="space-y-2">
                <label htmlFor="folder-audience" className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Quem pode ver?</label>
                <InstitutionalSelect
                  id="folder-audience"
                  ariaLabel="Quem pode ver?"
                  value={sharedAudience}
                  onValueChange={value => setSharedAudience(value as TargetAudience)}
                  options={availableFolderAudienceOptions}
                  allowClear={false}
                />
                <p className="text-[10px] font-medium leading-relaxed text-slate-500">
                  {audienceOptions.find((option) => option.value === sharedAudience)?.description}
                  {sharingFolder.parentId ? ' A pasta também respeita a permissão de todas as pastas acima dela.' : ''}
                </p>
              </div>
              <div className="biblioteca-dialog-footer flex justify-end gap-2">
                <button type="button" onClick={() => setSharingFolder(null)} className="rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={isSharingPending} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50">
                  {isSharingPending ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: RENOMEAR PASTA */}
      {renamingFolder && typeof window !== 'undefined' && createPortal(
        <div className="biblioteca-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60" onClick={() => setRenamingFolder(null)}></div>
          <div role="dialog" aria-modal="true" aria-label="Pasta" className="biblioteca-dialog biblioteca-explorer-dialog relative bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 animate-fadeIn">
            <h4 className="biblioteca-dialog-header text-lg font-black text-[#001a33] uppercase tracking-tight mb-4">Renomear Pasta</h4>
            <form onSubmit={handleRenameSubmit} className="biblioteca-dialog-body space-y-4">
              <input
                type="text"
                placeholder="Novo nome..."
                value={renamedName}
                onChange={(e) => setRenamedName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-blue-500 text-sm"
                required
                autoFocus
              />
              <div className="biblioteca-dialog-footer flex justify-end gap-2">
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
        <div className="biblioteca-dialog-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#001a33]/60" onClick={() => setMovingItem(null)}></div>
          <div role="dialog" aria-modal="true" aria-label="Destino do item" className="biblioteca-dialog biblioteca-explorer-dialog relative bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-fadeIn space-y-4">
            <div className="biblioteca-dialog-header">
              <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">
                {actionType === 'move' ? 'Mover' : 'Copiar'} {movingItem.type === 'folder' ? 'Pasta' : 'Documento'}
              </h4>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                {actionType === 'move' 
                  ? 'Selecione o diretório de destino na estrutura de arquivos.' 
                  : 'Selecione a pasta de destino para criar a cópia.'}
              </p>
            </div>

            <div className="biblioteca-dialog-body max-h-60 overflow-y-auto border border-slate-150 rounded-2xl divide-y divide-slate-100 custom-scrollbar">
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

            <div className="biblioteca-dialog-footer flex justify-end pt-2">
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

    </>
  );
}

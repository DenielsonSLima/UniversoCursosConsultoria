import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { LibraryFolder, TargetAudience } from '../biblioteca.types';
import FinderFolderIcon from './file-explorer/FinderFolderIcon';

const audienceLabel: Record<TargetAudience, string> = {
  INTERNO: 'Privada',
  ALUNOS: 'Alunos',
  PROFESSORES: 'Professores',
  TODOS: 'Todos',
};

interface LibraryFolderGridProps {
  folders: LibraryFolder[];
  selectedIds: Set<string>;
  onOpen: (folder: LibraryFolder) => void;
  onToggle: (folderId: string) => void;
  renderActions?: (folder: LibraryFolder) => ReactNode;
  showAudience?: boolean;
}

const LibraryFolderGrid = ({
  folders,
  selectedIds,
  onOpen,
  onToggle,
  renderActions,
  showAudience = false,
}: LibraryFolderGridProps) => {
  if (folders.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pastas</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{folders.length}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-start sm:gap-x-1 sm:gap-y-4">
        {folders.map((folder) => {
          const selected = selectedIds.has(folder.id);
          return (
            <article
              key={folder.id}
              className={`group relative min-w-0 rounded-2xl border px-3 pb-4 pt-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_28px_rgba(15,55,95,0.08)] focus-within:bg-white focus-within:shadow-[0_10px_28px_rgba(15,55,95,0.08)] active:bg-white sm:w-[152px] sm:shrink-0 ${
                selected
                  ? 'border-blue-300 bg-white shadow-[0_10px_28px_rgba(37,99,235,0.12)]'
                  : 'border-transparent hover:border-slate-200 focus-within:border-blue-200'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(folder.id)}
                className={`absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-md border transition-all sm:h-5 sm:w-5 ${
                  selected
                    ? 'border-blue-600 bg-blue-600 text-white opacity-100'
                    : 'border-slate-300 bg-white/95 text-transparent opacity-70 hover:border-blue-400 hover:opacity-100'
                }`}
                aria-label={`${selected ? 'Remover' : 'Selecionar'} pasta ${folder.nome}`}
                aria-pressed={selected}
              >
                <Check size={12} strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={() => onOpen(folder)}
                className="flex w-full min-w-0 flex-col items-center rounded-xl px-1 pb-1 pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title={`Abrir pasta ${folder.nome}`}
              >
                <div className="relative h-[80px] w-[96px] transition-transform duration-200 group-hover:scale-[1.04] group-active:scale-[0.98]">
                  <FinderFolderIcon className="h-full w-full object-contain drop-shadow-[0_5px_4px_rgba(14,116,165,0.16)]" />
                </div>
                <span className="mt-1 block min-h-[2.5em] w-full whitespace-normal break-words text-center text-xs font-bold leading-[1.25] text-[#001a33] [overflow-wrap:anywhere]">
                  {folder.nome}
                </span>
                {showAudience ? (
                  <span className={`mt-1 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wide ${folder.targetAudience === 'INTERNO' ? 'bg-slate-100 text-slate-500' : 'bg-blue-50 text-blue-600'}`}>
                    {audienceLabel[folder.targetAudience]}
                  </span>
                ) : null}
              </button>
              {renderActions ? renderActions(folder) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default LibraryFolderGrid;


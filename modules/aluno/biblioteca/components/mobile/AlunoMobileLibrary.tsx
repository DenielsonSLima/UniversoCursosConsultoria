import {
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Search,
  X,
} from 'lucide-react';

import LibraryFileThumbnail from '../../../../gestor/biblioteca/components/file-preview/LibraryFileThumbnail';

type LibraryFolder = {
  id: string;
  nome: string;
};

type LibraryDocumentItem = {
  id: string;
  titulo: string;
  descricao?: string | null;
  tipo_arquivo?: string | null;
  tamanho?: string | null;
  arquivo_url?: string | null;
};

type Breadcrumb = {
  id: string;
  nome: string;
};

type AlunoMobileLibraryProps = {
  breadcrumbs: Breadcrumb[];
  documents: LibraryDocumentItem[];
  folders: LibraryFolder[];
  isDownloadingSelection: boolean;
  isLoading: boolean;
  progressMessage: string;
  searchQuery: string;
  selectedDocumentIds: Set<string>;
  selectedFolderIds: Set<string>;
  onBreadcrumbClick: (folderId: string | null, index: number) => void;
  onClearSelection: () => void;
  onDownloadSelection: () => void;
  onDownloadDocument: (document: LibraryDocumentItem) => void;
  onOpenFolder: (folder: LibraryFolder) => void;
  onOpenPreview: (document: LibraryDocumentItem) => void;
  onSearchChange: (value: string) => void;
  onSelectVisible: () => void;
  onToggleDocument: (documentId: string) => void;
  onToggleFolder: (folderId: string) => void;
};

const AlunoMobileLibrary = ({
  breadcrumbs,
  documents,
  folders,
  isDownloadingSelection,
  isLoading,
  progressMessage,
  searchQuery,
  selectedDocumentIds,
  selectedFolderIds,
  onBreadcrumbClick,
  onClearSelection,
  onDownloadSelection,
  onDownloadDocument,
  onOpenFolder,
  onOpenPreview,
  onSearchChange,
  onSelectVisible,
  onToggleDocument,
  onToggleFolder,
}: AlunoMobileLibraryProps) => {
  const selectionCount = selectedFolderIds.size + selectedDocumentIds.size;
  const currentFolderName = breadcrumbs.at(-1)?.nome || 'Biblioteca principal';

  return (
    <div className="space-y-4 md:hidden">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#001f3f] p-5 text-white shadow-[0_18px_44px_-28px_rgba(0,31,63,0.85)]">
        <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full border-[24px] border-blue-500/15" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-200">
              <BookOpen size={16} aria-hidden="true" />
              <p className="text-[10px] font-black uppercase tracking-[0.2em]">Seu acervo digital</p>
            </div>
            <h1 className="mt-2 text-xl font-black tracking-tight">Biblioteca</h1>
            <p className="mt-1 max-w-[16rem] text-[11px] font-medium leading-relaxed text-slate-300">
              Apostilas, manuais e materiais liberados para seus cursos.
            </p>
          </div>
          <div className="flex h-12 min-w-12 flex-col items-center justify-center rounded-2xl bg-white/10 px-2">
            <strong className="text-lg font-black leading-none">{documents.length}</strong>
            <span className="mt-1 text-[9px] font-black uppercase tracking-wide text-blue-200">arquivos</span>
          </div>
        </div>

        <label className="relative mt-5 block">
          <span className="sr-only">Pesquisar no acervo</span>
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-blue-200" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar apostila ou material..."
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 pl-11 pr-4 text-base font-bold text-white outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20"
          />
        </label>
      </section>

      <nav aria-label="Caminho da biblioteca" className="flex min-h-12 items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200/80 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400 shadow-sm [scrollbar-width:none]">
        <button type="button" onClick={() => onBreadcrumbClick(null, -1)} className="min-h-9 shrink-0 rounded-xl px-2 text-blue-600 active:bg-blue-50">
          Início
        </button>
        {breadcrumbs.map((crumb, index) => (
          <span key={crumb.id} className="flex shrink-0 items-center gap-1.5">
            <ChevronRight size={13} className="text-slate-300" />
            <button type="button" onClick={() => onBreadcrumbClick(crumb.id, index)} className={`min-h-9 max-w-[11rem] truncate rounded-xl px-2 ${index === breadcrumbs.length - 1 ? 'bg-slate-50 text-[#001a33]' : ''}`}>
              {crumb.nome}
            </button>
          </span>
        ))}
      </nav>

      {selectionCount > 0 ? (
        <section className="sticky top-2 z-20 rounded-[1.35rem] border border-blue-200 bg-white p-3 shadow-lg" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-600">{selectionCount} selecionado{selectionCount === 1 ? '' : 's'}</p>
              <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{progressMessage || 'Pronto para baixar'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" onClick={onSelectVisible} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-600" aria-label="Selecionar todos os itens visíveis">
                <CheckCheck size={18} />
              </button>
              <button type="button" onClick={onDownloadSelection} disabled={isDownloadingSelection} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-60" aria-label="Baixar itens selecionados">
                <Download size={18} />
              </button>
              <button type="button" onClick={onClearSelection} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-500" aria-label="Limpar seleção">
                <X size={18} />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <div className="space-y-3" aria-live="polite">
          <div className="h-24 animate-pulse rounded-[1.5rem] bg-white motion-reduce:animate-none" />
          {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-[1.5rem] bg-white motion-reduce:animate-none" />)}
          <span className="sr-only">Buscando acervo digital</span>
        </div>
      ) : (
        <>
          {folders.length > 0 ? (
            <section aria-labelledby="mobile-library-folders-title">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Pastas</p>
                  <h2 id="mobile-library-folders-title" className="mt-0.5 text-sm font-black text-[#001a33]">{currentFolderName}</h2>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{folders.length}</span>
              </div>
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none]">
                {folders.map((folder) => {
                  const isSelected = selectedFolderIds.has(folder.id);
                  return (
                    <article key={folder.id} className={`relative min-w-[72%] snap-start rounded-[1.35rem] border bg-white p-4 shadow-sm ${isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200/80'}`}>
                      <button type="button" onClick={() => onToggleFolder(folder.id)} className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl border ${isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-400'}`} aria-label={`${isSelected ? 'Remover' : 'Selecionar'} pasta ${folder.nome}`} aria-pressed={isSelected}>
                        <Check size={17} strokeWidth={3} />
                      </button>
                      <button type="button" onClick={() => onOpenFolder(folder)} className="flex min-h-16 w-full items-center gap-3 pr-12 text-left">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Folder size={23} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Abrir pasta</span>
                          <span className="mt-1 line-clamp-2 block text-sm font-black leading-snug text-[#001a33]">{folder.nome}</span>
                        </span>
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="mobile-library-documents-title">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Materiais</p>
                <h2 id="mobile-library-documents-title" className="mt-0.5 text-sm font-black text-[#001a33]">Arquivos pedagógicos</h2>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">{documents.length}</span>
            </div>

            {documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((document) => {
                  const isSelected = selectedDocumentIds.has(document.id);
                  return (
                    <article key={document.id} className={`overflow-hidden rounded-[1.5rem] border bg-white shadow-sm ${isSelected ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200/80'}`}>
                      <div className="flex gap-3 p-3">
                        <LibraryFileThumbnail file={{ fileType: document.tipo_arquivo, title: document.titulo, url: document.arquivo_url }} className="h-[4.5rem] !w-[4.5rem] shrink-0 rounded-2xl" />
                        <div className="min-w-0 flex-1 py-0.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="line-clamp-2 text-sm font-black leading-snug text-[#001a33]">{document.titulo}</h3>
                              <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-relaxed text-slate-500">{document.descricao || 'Material disponibilizado para consulta.'}</p>
                            </div>
                            <button type="button" onClick={() => onToggleDocument(document.id)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-400'}`} aria-label={`${isSelected ? 'Remover' : 'Selecionar'} arquivo ${document.titulo}`} aria-pressed={isSelected}>
                              <Check size={17} strokeWidth={3} />
                            </button>
                          </div>
                          {document.tamanho ? <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{document.tamanho}</p> : null}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 pt-2.5">
                        <button type="button" onClick={() => onOpenPreview(document)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-50 text-[10px] font-black uppercase tracking-wide text-blue-700">
                          <Eye size={15} /> Visualizar
                        </button>
                        <button type="button" onClick={() => onDownloadDocument(document)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-600">
                          <Download size={15} /> Baixar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : folders.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center rounded-[1.5rem] border border-slate-200/80 bg-white p-6 text-center shadow-sm">
                <FolderOpen size={30} className="text-slate-300" />
                <h3 className="mt-3 text-sm font-black text-[#001a33]">Nenhum material nesta pasta</h3>
                <p className="mt-1 max-w-xs text-[11px] font-medium leading-relaxed text-slate-500">Os materiais liberados para seu curso aparecerão aqui.</p>
              </div>
            ) : (
              <div className="flex min-h-24 items-center gap-3 rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm">
                <FileText size={20} className="shrink-0 text-slate-300" />
                <p className="text-[11px] font-medium text-slate-500">Abra uma das pastas acima para encontrar os materiais.</p>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default AlunoMobileLibrary;

import React from 'react';
import { ArrowUp, ChevronRight, FolderPlus, Search } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import type { TargetAudience } from '../../biblioteca.types';

interface FileExplorerToolbarProps {
  breadcrumbs: Array<{ id: string; nome: string; targetAudience: TargetAudience }>;
  isFiltering: boolean;
  searchQuery: string;
  fileTypeFilter: string;
  readOnly: boolean;
  canUpload: boolean;
  onBreadcrumbClick: (id: string | null, index: number) => void;
  onSearchChange: (value: string) => void;
  onFileTypeChange: (value: string) => void;
  onClear: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
}

const FILE_TYPES = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'PDF', label: 'PDF' },
  { value: 'DOC', label: 'Word' },
  { value: 'XLS', label: 'Excel' },
  { value: 'PPT', label: 'PowerPoint' },
  { value: 'IMG', label: 'Imagens' },
  { value: 'VIDEO', label: 'Vídeos' },
  { value: 'OTHER', label: 'Outros formatos' },
];

export default function FileExplorerToolbar({
  breadcrumbs, isFiltering, searchQuery, fileTypeFilter, readOnly, canUpload,
  onBreadcrumbClick, onSearchChange, onFileTypeChange, onClear, onCreateFolder, onUpload,
}: FileExplorerToolbarProps) {
  return (
    <div className="biblioteca-explorer-toolbar">
      <nav className="biblioteca-explorer-breadcrumbs" aria-label="Caminho da biblioteca">
        {isFiltering ? (
          <div className="biblioteca-explorer-search-state">
            <span>Busca global ativa</span>
            {searchQuery && <span className="biblioteca-explorer-search-term">"{searchQuery}"</span>}
            {fileTypeFilter !== 'all' && <span className="biblioteca-explorer-search-type">Tipo: {fileTypeFilter}</span>}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => onBreadcrumbClick(null, -1)}>Raiz</button>
            {breadcrumbs.map((crumb, index) => (
              <React.Fragment key={crumb.id}>
                <ChevronRight size={12} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onBreadcrumbClick(crumb.id, index)}
                  aria-current={index === breadcrumbs.length - 1 ? 'location' : undefined}
                >
                  {crumb.nome}
                </button>
              </React.Fragment>
            ))}
          </>
        )}
      </nav>
      <div className="biblioteca-explorer-controls">
        <div className="biblioteca-explorer-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            aria-label="Buscar em todas as pastas"
            placeholder="Buscar em todas as pastas..."
            value={searchQuery}
            onChange={event => onSearchChange(event.target.value)}
          />
        </div>
        <div className="biblioteca-explorer-type-filter">
          <InstitutionalSelect
            ariaLabel="Tipo de arquivo"
            value={fileTypeFilter}
            onValueChange={onFileTypeChange}
            options={FILE_TYPES}
            allowClear={false}
          />
          {isFiltering && <button type="button" onClick={onClear} className="biblioteca-explorer-clear">Limpar</button>}
        </div>
        {!readOnly && canUpload && !isFiltering && (
          <div className="biblioteca-explorer-actions">
            <button type="button" onClick={onCreateFolder} className="biblioteca-explorer-secondary">
              <FolderPlus size={14} /> Nova Pasta
            </button>
            <button type="button" onClick={onUpload} className="biblioteca-explorer-primary">
              <ArrowUp size={14} /> Enviar Arquivo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

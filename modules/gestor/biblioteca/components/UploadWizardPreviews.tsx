import React from 'react';
import { Eye, FileText, Check } from 'lucide-react';
import LibraryFileIcon from './file-preview/LibraryFileIcon';
import { detectLibraryFileType, getFileExtension, getFileTypeLabel } from './file-preview/filePreview.utils';

export const UploadFilePreview = ({ file, filePreviewUrl }: { file: File | null; filePreviewUrl: string }) => {
    if (!file) {
      return (
        <div className="h-full min-h-[280px] rounded-2xl border border-dashed border-slate-250 bg-slate-50 flex flex-col items-center justify-center text-center p-6">
          <Eye size={24} className="text-slate-350 mb-3" />
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Preview do arquivo</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs">A visualizacao aparece assim que o upload for selecionado.</p>
        </div>
      );
    }

    const fileType = detectLibraryFileType(file.name);
    const ext = getFileExtension(file.name).toUpperCase() || 'OTHER';

    if (fileType === 'IMG' && filePreviewUrl) {
      return (
        <div className="h-full min-h-[280px] rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden flex items-center justify-center">
          <img src={filePreviewUrl} alt="Preview do documento" className="w-full h-full object-contain" />
        </div>
      );
    }

    if (fileType === 'PDF' && filePreviewUrl) {
      return (
        <div className="h-full min-h-[280px] rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden">
          <object data={filePreviewUrl} type="application/pdf" className="w-full h-full min-h-[280px]">
            <div className="h-full min-h-[280px] flex items-center justify-center text-center p-6">
              <FileText size={28} className="text-red-500 mb-3" />
              <p className="text-xs font-bold text-slate-600">Preview de PDF indisponivel neste navegador.</p>
            </div>
          </object>
        </div>
      );
    }

    const hasInternalPreviewAfterUpload = ['DOC', 'XLS', 'PPT'].includes(fileType);

    return (
      <div className="h-full min-h-[280px] rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center p-6">
        <LibraryFileIcon kind={fileType} size="lg" />
        <p className="mt-4 text-sm font-black text-[#001a33] uppercase">{getFileTypeLabel(fileType)} • {ext}</p>
        <p className="text-xs font-bold text-slate-600 mt-1 max-w-xs truncate">{file.name}</p>
        <p className="text-[11px] text-slate-400 mt-2 max-w-sm">
          {hasInternalPreviewAfterUpload
            ? 'A visualização completa será liberada dentro do sistema assim que o arquivo for publicado.'
            : 'Este formato será salvo normalmente e poderá ser baixado pelo acervo.'}
        </p>
      </div>
    );
  };

export const UploadSelectionList = ({ type, items, selectedIds, onToggle }: {
  type: 'curso' | 'turma';
  items: any[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) => (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="max-h-56 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {items.map(item => {
          const isSelected = selectedIds.includes(item.id);
          const subtitle = type === 'curso' ? item.modalidade : item.codigo;

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onToggle(item.id)}
              className={`w-full min-h-11 text-left px-3 py-2 rounded-xl text-xs font-bold uppercase flex justify-between items-center gap-3 transition-all ${
                isSelected
                  ? type === 'curso'
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'hover:bg-slate-50 text-slate-650 border border-transparent'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{item.nome}</span>
                {subtitle && <span className="block text-[9px] text-slate-400 font-black mt-0.5">{subtitle}</span>}
              </span>
              {isSelected && <Check size={14} className="shrink-0" />}
            </button>
          );
        })}

        {items.length === 0 && (
          <div className="py-8 text-center text-[11px] text-slate-400 font-bold uppercase">
            Nenhum resultado encontrado.
          </div>
        )}
      </div>
    </div>
  );


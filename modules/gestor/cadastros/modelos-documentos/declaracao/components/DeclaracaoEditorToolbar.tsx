import React from 'react';
import { ArrowLeft, Eye, Loader2, RefreshCw, Save, Tags, TriangleAlert } from 'lucide-react';

interface DeclaracaoEditorToolbarProps {
  editorTitle: string;
  hideBackButton: boolean;
  onBack: () => void;
  onSave: () => void;
  poloName: string;
  saving: boolean;
  scopeLabel?: string;
  previewActive?: boolean;
  previewLabel?: string;
  previewLoading?: boolean;
  previewError?: string;
  onLoadPreview?: () => void;
  onClearPreview?: () => void;
}

const DeclaracaoEditorToolbar: React.FC<DeclaracaoEditorToolbarProps> = ({
  editorTitle,
  hideBackButton,
  onBack,
  onSave,
  poloName,
  saving,
  scopeLabel,
  previewActive = false,
  previewLabel,
  previewLoading = false,
  previewError,
  onLoadPreview,
  onClearPreview,
}) => (
  <div className="mb-6 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-6">
    <div className="flex min-w-0 items-center gap-4">
      {!hideBackButton && (
        <button
          onClick={onBack}
          className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="min-w-0">
        <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{editorTitle}</h3>
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
          {scopeLabel ? 'Modalidade' : 'Unidade'}:{' '}
          <span className="text-blue-600">{scopeLabel || poloName}</span>
        </p>
      </div>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2">
      {previewError && (
        <span className="inline-flex max-w-72 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">
          <TriangleAlert size={14} className="shrink-0" />
          {previewError}
        </span>
      )}

      {onLoadPreview && !previewActive && (
        <button
          type="button"
          onClick={onLoadPreview}
          disabled={previewLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60"
        >
          {previewLoading
            ? <Loader2 size={15} className="animate-spin" />
            : <Eye size={15} />}
          {previewLoading ? 'Carregando aluno...' : 'Prévia com aluno real'}
        </button>
      )}

      {previewActive && (
        <>
          <div className="max-w-72 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">
              Prévia — não será salva
            </p>
            <p className="truncate text-[11px] font-bold text-slate-700" title={previewLabel}>
              {previewLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onLoadPreview}
            disabled={previewLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
            title="Mostrar outro aluno"
          >
            {previewLoading
              ? <Loader2 size={15} className="animate-spin" />
              : <RefreshCw size={15} />}
            Trocar aluno
          </button>
          <button
            type="button"
            onClick={onClearPreview}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-blue-200 hover:text-blue-700"
          >
            <Tags size={15} />
            Ver marcadores
          </button>
        </>
      )}

      <button
        onClick={onSave}
        disabled={saving || previewActive}
        title={previewActive ? 'Volte aos marcadores para salvar o modelo.' : undefined}
        className="flex items-center gap-2 rounded-xl bg-[#001a33] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
      </button>
    </div>
  </div>
);

export default DeclaracaoEditorToolbar;

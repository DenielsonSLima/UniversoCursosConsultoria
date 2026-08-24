import React from 'react';
import { BookOpenCheck, Info, Loader2, Save } from 'lucide-react';
import ToastNotification from '../../../parceiros/components/shared/ToastNotification';
import DiarioBackCoverSettingsPanel from './components/DiarioBackCoverSettingsPanel';
import DiarioCoverFieldsPanel from './components/DiarioCoverFieldsPanel';
import DiarioEditorCanvas from './components/DiarioEditorCanvas';
import DiarioFieldPropertiesPanel from './components/DiarioFieldPropertiesPanel';
import DiarioImageUploader from './components/DiarioImageUploader';
import DiarioTextSettings from './components/DiarioTextSettings';
import { useDiarioTemplateEditor } from './hooks/useDiarioTemplateEditor';

const DiariosPage: React.FC = () => {
  const editor = useDiarioTemplateEditor();
  const {
    activeTab,
    canvasRef,
    capaInputRef,
    capaCampos,
    contracapaCustomImageRef,
    contracapaInputRef,
    cursos,
    currentField,
    draggingField,
    form,
    getPxFontSize,
    handleMouseDown,
    handleUpload,
    loadingCursos,
    loadingTemplate,
    previewLogoUrl,
    previewWatermark,
    previewInstitutionalAssetsError,
    removeToast,
    saveMutation,
    selectedCurso,
    selectedFieldId,
    selectedModality,
    setActiveTab,
    setForm,
    setSelectedCurso,
    setSelectedFieldId,
    setShowCrosshairs,
    setShowGrid,
    setSnapToGrid,
    showCrosshairs,
    showGrid,
    snapToGrid,
    templateError,
    toasts,
    updateFieldProperty,
    uploading,
  } = editor;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm animate-fadeIn">
      <input ref={capaInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => handleUpload(event, 'capa')} />
      <input ref={contracapaInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => handleUpload(event, 'contracapa')} />
      <input ref={contracapaCustomImageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => handleUpload(event, 'contracapa_custom')} />

      <PageHeader
        disabled={!selectedCurso || Boolean(uploading) || saveMutation.isPending || Boolean(templateError)}
        saving={saveMutation.isPending}
        onSave={() => saveMutation.mutate()}
      />

      <div className="p-6 md:p-8 space-y-6">
        <CourseTabs
          cursos={cursos}
          loading={loadingCursos}
          selectedCurso={selectedCurso}
          onSelect={setSelectedCurso}
          disabled={Boolean(uploading) || saveMutation.isPending}
        />

        {previewInstitutionalAssetsError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">
            {(previewInstitutionalAssetsError as Error).message}
          </div>
        )}

        {loadingTemplate ? (
          <div className="flex min-h-[520px] items-center justify-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 className="animate-spin text-blue-600" /> Carregando modelo…
          </div>
        ) : templateError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">
            {(templateError as Error).message}
          </div>
        ) : selectedModality ? (
          <div className="space-y-6">
            <EditorTabs
              activeTab={activeTab}
              modalityName={selectedModality.nome}
              onSelect={setActiveTab}
            />

            {(activeTab === 'capa' || activeTab === 'contracapa') && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8 animate-fadeIn">
                <div className="space-y-6">
                  <DiarioEditorCanvas
                    activeTab={activeTab}
                    canvasRef={canvasRef}
                    capaCampos={capaCampos}
                    currentField={currentField}
                    draggingField={draggingField}
                    form={form}
                    getPxFontSize={getPxFontSize}
                    handleMouseDown={handleMouseDown}
                    previewWatermark={previewWatermark}
                    previewLogoUrl={previewLogoUrl}
                    selectedFieldId={selectedFieldId}
                    setShowCrosshairs={setShowCrosshairs}
                    setShowGrid={setShowGrid}
                    setSnapToGrid={setSnapToGrid}
                    showCrosshairs={showCrosshairs}
                    showGrid={showGrid}
                    snapToGrid={snapToGrid}
                  />
                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-blue-900">
                        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                          <Info size={16} /> {activeTab === 'capa' ? 'Capa oficial do diário' : 'Contracapa oficial do diário'}
                        </div>
                        <p className="mt-2 text-[11px] font-semibold leading-relaxed text-blue-800">
                          {activeTab === 'capa'
                            ? 'Quando uma capa é enviada, ela permanece como o modelo visual integral aprovado. Os campos variáveis continuam independentes e posicionáveis por cima da arte.'
                            : 'A imagem enviada ocupa o fundo da página 2. Campos, QR Code e slots de assinatura eletrônica continuam independentes e posicionáveis.'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <DiarioImageUploader
                          title={activeTab === 'capa' ? 'Capa visual configurada' : 'Fundo da contracapa'}
                          description={activeTab === 'capa' ? 'Modelo visual integral da página 1' : 'Camada visual da página 2'}
                          imageUrl={activeTab === 'capa' ? form.capaUrl : form.contracapaUrl}
                          loading={uploading === (activeTab === 'capa' ? 'capa' : 'contracapa')}
                          onSelect={() => (activeTab === 'capa' ? capaInputRef : contracapaInputRef).current?.click()}
                          onRemove={() => setForm((current) => ({
                            ...current,
                            [activeTab === 'capa' ? 'capaUrl' : 'contracapaUrl']: null,
                          }))}
                        />
                        {activeTab === 'capa' && !form.capaUrl && form.contracapaUrl && (
                          <button
                            type="button"
                            onClick={() => setForm((current) => ({
                              ...current,
                              capaUrl: current.contracapaUrl,
                              contracapaUrl: null,
                            }))}
                            className="w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-blue-700 transition hover:bg-blue-100"
                          >
                            Corrigir destino: mover esta imagem para a capa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  {selectedFieldId && currentField ? (
                    <DiarioFieldPropertiesPanel
                      activeTab={activeTab}
                      currentField={currentField}
                      setForm={setForm}
                      setSelectedFieldId={setSelectedFieldId}
                      updateFieldProperty={updateFieldProperty}
                    />
                  ) : activeTab === 'capa' ? (
                    <DiarioCoverFieldsPanel
                      capaCampos={capaCampos}
                      selectedFieldId={selectedFieldId}
                      setForm={setForm}
                      setSelectedFieldId={setSelectedFieldId}
                      updateFieldProperty={updateFieldProperty}
                    />
                  ) : (
                    <DiarioBackCoverSettingsPanel
                      contracapaCustomImageRef={contracapaCustomImageRef}
                      form={form}
                      selectedFieldId={selectedFieldId}
                      setForm={setForm}
                      setSelectedFieldId={setSelectedFieldId}
                      uploading={uploading}
                    />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'textos' && <DiarioTextSettings form={form} setForm={setForm} />}
          </div>
        ) : null}
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

interface PageHeaderProps {
  disabled: boolean;
  onSave: () => void;
  saving: boolean;
}

const PageHeader: React.FC<PageHeaderProps> = ({ disabled, onSave, saving }) => (
  <div className="relative border-b border-slate-100 bg-[#001a33] px-6 py-7 text-white md:px-8">
    <div className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_center,rgba(37,99,235,.35),transparent_68%)]" />
    <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-blue-200">
          <BookOpenCheck size={30} />
        </div>
        <div>
          <h3 className="text-2xl font-black uppercase tracking-tight">Modelos de Diários</h3>
          <p className="mt-1 text-sm font-medium text-slate-300">Layout da capa, validação na contracapa e textos de diários por modalidade.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-black uppercase tracking-wider text-[#001a33] shadow-lg transition hover:bg-blue-50 disabled:opacity-60"
      >
        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Salvar configurações
      </button>
    </div>
  </div>
);

interface CourseTabsProps {
  cursos: Array<{ id: string; nome: string }>;
  disabled: boolean;
  loading: boolean;
  onSelect: React.Dispatch<React.SetStateAction<string>>;
  selectedCurso: string;
}

const CourseTabs: React.FC<CourseTabsProps> = ({ cursos, disabled, loading, onSelect, selectedCurso }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-black uppercase tracking-[.22em] text-slate-400">Modalidades de Cursos</p>
    {loading ? (
      <div className="flex items-center gap-2 py-4 text-xs font-bold text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={16} /> Carregando modalidades...
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl bg-slate-100/70 p-1.5 border border-slate-200/50">
        {cursos.map((curso) => {
          const isSelected = selectedCurso === curso.id;
          return (
            <button
              key={curso.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(curso.id)}
              className={`flex flex-col items-center justify-center rounded-xl py-3 px-4 text-center transition-all disabled:cursor-not-allowed disabled:opacity-60 ${
                isSelected
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200/10 font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/40 border border-transparent'
              }`}
            >
              <span className="text-xs font-bold leading-tight">{curso.nome}</span>
              <span className="mt-0.5 text-[8.5px] font-black uppercase tracking-widest text-slate-400 leading-none">Modelo Geral</span>
            </button>
          );
        })}
      </div>
    )}
  </div>
);

interface EditorTabsProps {
  activeTab: 'capa' | 'contracapa' | 'textos';
  modalityName: string;
  onSelect: React.Dispatch<React.SetStateAction<'capa' | 'contracapa' | 'textos'>>;
}

const EditorTabs: React.FC<EditorTabsProps> = ({ activeTab, modalityName, onSelect }) => (
  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-4">
    <div>
      <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-600">Configurando Capa de</p>
      <h4 className="mt-1 text-2xl font-black text-[#001a33]">{modalityName}</h4>
    </div>
    <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1">
      <EditorTabButton active={activeTab === 'capa'} label="Capa Frontal" onClick={() => onSelect('capa')} />
      <EditorTabButton active={activeTab === 'contracapa'} label="Contracapa (Validação)" onClick={() => onSelect('contracapa')} />
      <EditorTabButton active={activeTab === 'textos'} label="Textos Gerais" onClick={() => onSelect('textos')} />
    </div>
  </div>
);

const EditorTabButton: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
      active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
    }`}
  >
    {label}
  </button>
);

export default DiariosPage;

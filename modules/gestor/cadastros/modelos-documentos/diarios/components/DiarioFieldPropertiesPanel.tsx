import React from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Trash2, Type } from 'lucide-react';
import { CapaCampo, DiarioTemplate } from '../diarios.service';
import { DiarioEditorTab } from '../diarios-editor.types';

interface DiarioFieldPropertiesPanelProps {
  activeTab: DiarioEditorTab;
  currentField: CapaCampo;
  setForm: React.Dispatch<React.SetStateAction<DiarioTemplate>>;
  setSelectedFieldId: React.Dispatch<React.SetStateAction<string | null>>;
  updateFieldProperty: <K extends keyof CapaCampo>(fieldId: string, property: K, value: CapaCampo[K]) => void;
}

const DiarioFieldPropertiesPanel: React.FC<DiarioFieldPropertiesPanelProps> = ({
  activeTab,
  currentField,
  setForm,
  setSelectedFieldId,
  updateFieldProperty,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 animate-fadeIn">
    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
      <h5 className="text-xs font-black uppercase tracking-wider text-slate-800">
        {currentField.isImage ? 'Propriedades da Imagem' : 'Propriedades do Campo'}
      </h5>
      <button
        type="button"
        onClick={() => setSelectedFieldId(null)}
        className="text-xs font-bold text-blue-600 hover:text-blue-800"
      >
        Fechar Propriedades
      </button>
    </div>

    {currentField.isImage ? (
      <ImageProperties currentField={currentField} updateFieldProperty={updateFieldProperty} />
    ) : (
      <TextProperties currentField={currentField} updateFieldProperty={updateFieldProperty} />
    )}

    <PositionControls currentField={currentField} updateFieldProperty={updateFieldProperty} />

    {(currentField.id.startsWith('logo_') || currentField.id.startsWith('signature_')) && (
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Deseja excluir esta imagem do layout?')) {
            setForm((previous) => {
              const targetKey = activeTab === 'capa' ? 'capaCampos' : 'contracapaCampos';
              const fields = previous[targetKey] || [];
              return { ...previous, [targetKey]: fields.filter((field) => field.id !== currentField.id) };
            });
            setSelectedFieldId(null);
          }
        }}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-50 hover:bg-red-100 py-2.5 text-xs font-bold text-red-600 transition"
      >
        <Trash2 size={14} /> Excluir do Layout
      </button>
    )}
  </div>
);

type UpdateFieldProperty = DiarioFieldPropertiesPanelProps['updateFieldProperty'];

const ImageProperties: React.FC<{ currentField: CapaCampo; updateFieldProperty: UpdateFieldProperty }> = ({
  currentField,
  updateFieldProperty,
}) => (
  <>
    <div className="block">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Largura / Tamanho (%)</span>
        <span className="text-xs font-bold text-slate-700">{currentField.width}%</span>
      </div>
      <input
        type="range"
        min="5"
        max="80"
        value={currentField.width}
        onChange={(event) => updateFieldProperty(currentField.id, 'width', parseInt(event.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
    <p className="rounded-xl bg-slate-50 p-3 text-[10px] font-semibold leading-relaxed text-slate-600">
      Transparência real do PNG é preservada como recurso isolado. Modos de mesclagem do navegador não são usados porque não possuem equivalente estável no PDF oficial.
    </p>
  </>
);

const TextProperties: React.FC<{ currentField: CapaCampo; updateFieldProperty: UpdateFieldProperty }> = ({
  currentField,
  updateFieldProperty,
}) => (
  <>
    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Rótulo / Prefixo</span>
      <input
        type="text"
        value={currentField.label}
        onChange={(event) => updateFieldProperty(currentField.id, 'label', event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
      />
    </label>
    <RangeProperty
      label="Tamanho da Fonte"
      value={currentField.fontSize}
      suffix="pt"
      min={4}
      max={24}
      onChange={(value) => updateFieldProperty(currentField.id, 'fontSize', value)}
    />
    <RangeProperty
      label="Largura do Campo"
      value={currentField.width}
      suffix="%"
      min={currentField.id.startsWith('contracapaAssinatura') ? 38 : currentField.id === 'contracapaQrCode' ? 6.8 : 1}
      max={currentField.id.startsWith('contracapaAssinatura') ? 90 : currentField.id === 'contracapaQrCode' ? 23.5 : 100}
      step={currentField.id === 'contracapaQrCode' ? 0.1 : 1}
      onChange={(value) => updateFieldProperty(currentField.id, 'width', value)}
    />
    <div className="grid grid-cols-2 gap-3 pt-2">
      <ToggleButton
        active={currentField.bold}
        label="Negrito"
        icon={<Bold size={14} />}
        onClick={() => updateFieldProperty(currentField.id, 'bold', !currentField.bold)}
      />
      <ToggleButton
        active={!!currentField.borderTop}
        label="Assinatura (Linha)"
        icon={<Type size={14} />}
        onClick={() => updateFieldProperty(currentField.id, 'borderTop', !currentField.borderTop)}
      />
    </div>
    <div>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Alinhamento</span>
      <div className="flex rounded-xl bg-slate-100 p-1">
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => updateFieldProperty(currentField.id, 'align', align)}
            className={`flex flex-1 items-center justify-center rounded-lg py-1.5 transition ${
              currentField.align === align || (!currentField.align && align === 'left')
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {align === 'left' && <AlignLeft size={14} />}
            {align === 'center' && <AlignCenter size={14} />}
            {align === 'right' && <AlignRight size={14} />}
          </button>
        ))}
      </div>
    </div>
    <div className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Cor do Texto</span>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={currentField.color || '#071a33'}
          onChange={(event) => updateFieldProperty(currentField.id, 'color', event.target.value)}
          className="h-8 w-8 cursor-pointer rounded border border-slate-200"
        />
        <input
          type="text"
          value={currentField.color || '#071a33'}
          onChange={(event) => updateFieldProperty(currentField.id, 'color', event.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
        />
      </div>
    </div>
  </>
);

interface RangePropertyProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  suffix: string;
  value: number;
  step?: number;
}

const RangeProperty: React.FC<RangePropertyProps> = ({ label, max, min, onChange, step = 1, suffix, value }) => (
  <div className="block">
    <div className="flex justify-between items-center mb-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</span>
      <span className="text-xs font-bold text-slate-700">{value}{suffix}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-blue-600"
    />
  </div>
);

const ToggleButton: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
      active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
    }`}
  >
    {icon} {label}
  </button>
);

const PositionControls: React.FC<{ currentField: CapaCampo; updateFieldProperty: UpdateFieldProperty }> = ({
  currentField,
  updateFieldProperty,
}) => (
  <div>
    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">Ajuste Fino de Posição</span>
    <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto text-center">
      <div />
      <PositionButton label="▲" onClick={() => updateFieldProperty(currentField.id, 'y', Math.max(0, currentField.y - 0.5))} />
      <div />
      <PositionButton label="◀" onClick={() => updateFieldProperty(currentField.id, 'x', Math.max(0, currentField.x - 0.5))} />
      <div className="flex items-center justify-center text-[10px] font-bold text-slate-400">Pos</div>
      <PositionButton label="▶" onClick={() => updateFieldProperty(currentField.id, 'x', Math.min(100 - currentField.width, currentField.x + 0.5))} />
      <div />
      <PositionButton label="▼" onClick={() => updateFieldProperty(currentField.id, 'y', Math.min(95, currentField.y + 0.5))} />
    </div>
  </div>
);

const PositionButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button type="button" onClick={onClick} className="rounded bg-slate-100 p-2 text-xs font-bold hover:bg-slate-200">
    {label}
  </button>
);

export default DiarioFieldPropertiesPanel;

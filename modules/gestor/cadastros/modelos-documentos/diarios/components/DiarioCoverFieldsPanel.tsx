import React from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { CapaCampo, DEFAULT_CAPA_CAMPOS, DiarioTemplate } from '../diarios.service';

interface DiarioCoverFieldsPanelProps {
  capaCampos: CapaCampo[];
  selectedFieldId: string | null;
  setForm: React.Dispatch<React.SetStateAction<DiarioTemplate>>;
  setSelectedFieldId: React.Dispatch<React.SetStateAction<string | null>>;
  updateFieldProperty: <K extends keyof CapaCampo>(fieldId: string, property: K, value: CapaCampo[K]) => void;
}

const fieldNames: Record<string, string> = {
  curso: 'Curso',
  modulo: 'Módulo',
  areaTematica: 'Área Temática',
  disciplina: 'Disciplina',
  turma: 'Turma',
  professor: 'Professor',
};

const DiarioCoverFieldsPanel: React.FC<DiarioCoverFieldsPanelProps> = ({
  capaCampos,
  selectedFieldId,
  setForm,
  setSelectedFieldId,
  updateFieldProperty,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Campos da Capa</span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Redefinir posições padrão da capa?')) {
            setForm((previous) => ({ ...previous, capaCampos: DEFAULT_CAPA_CAMPOS }));
          }
        }}
        className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-red-500"
      >
        <RotateCcw size={12} /> Redefinir
      </button>
    </div>
    <div className="space-y-1">
      {capaCampos.map((field) => (
        <div
          key={field.id}
          onClick={() => setSelectedFieldId(field.id)}
          className={`flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer transition ${
            selectedFieldId === field.id
              ? 'bg-blue-50 text-blue-700 font-bold'
              : 'hover:bg-slate-100 text-slate-700'
          }`}
        >
          <span className="text-xs flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${field.visible ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {fieldNames[field.id]}
          </span>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              updateFieldProperty(field.id, 'visible', !field.visible);
            }}
            className="text-slate-400 hover:text-slate-700 p-1"
          >
            {field.visible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      ))}
    </div>
  </div>
);

export default DiarioCoverFieldsPanel;

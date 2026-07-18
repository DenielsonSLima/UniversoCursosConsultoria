import React from 'react';
import {
  FileSignature,
  Image as ImageIcon,
  Loader2,
  Minus,
  Plus,
  ShieldCheck,
  Square,
  Type,
} from 'lucide-react';
import type { CrachaPeriodoEleitoralEditor, CrachaSignatureRole } from '../useCrachaPeriodoEleitoralEditor';

interface Props {
  editor: CrachaPeriodoEleitoralEditor;
  page: 'frente' | 'verso';
}

const SIGNATURE_ROLES: { id: CrachaSignatureRole; label: string }[] = [
  { id: 'diretoriaGeral', label: 'Diretoria' },
  { id: 'secretaria', label: 'Secretaria' },
  { id: 'coordenacao', label: 'Coordenação' },
  { id: 'financeiro', label: 'Financeiro' },
];

const getFieldDescription = (field: any) => {
  if (field.type === 'photo') return 'Foto do aluno';
  if (field.type === 'image') return field.label || 'Assinatura cadastrada';
  if (field.type === 'boxText') return `Caixa: ${String(field.value || '').slice(0, 24)}`;
  if (field.type === 'line') return 'Linha';
  if (field.type === 'rect') return 'Forma';
  if (field.type === 'seal') return 'Selo Sergipe';
  return String(field.value || 'Texto').slice(0, 28);
};

const ElementIcon: React.FC<{ type: string }> = ({ type }) => {
  if (type === 'photo') return <ImageIcon size={14} className="text-slate-400 shrink-0" />;
  if (type === 'image') return <FileSignature size={14} className="text-slate-400 shrink-0" />;
  if (type === 'boxText') return <Square size={14} className="text-slate-400 shrink-0" />;
  if (type === 'line') return <Minus size={14} className="text-slate-400 shrink-0" />;
  if (type === 'rect') return <Square size={14} className="text-slate-400 shrink-0" />;
  if (type === 'seal') return <ShieldCheck size={14} className="text-slate-400 shrink-0" />;
  return <Type size={14} className="text-slate-400 shrink-0" />;
};

const CrachaPeriodoEleitoralElementsPanel: React.FC<Props> = ({ editor, page }) => {
  const {
    formData,
    selectedFieldId,
    setSelectedFieldId,
    signatureLoadingRole,
    handleResetDefaultFields,
    handleAddText,
    handleAddBox,
    handleAddLine,
    handleAddShape,
    handleAddPhoto,
    handleAddSignature,
  } = editor;

  return (
    <div className="space-y-5">
      <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/70 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-[10px] font-black text-[#001a33] uppercase tracking-widest flex items-center gap-2">
            <Plus size={14} className="text-blue-600" /> Inserir Elemento
          </h4>
          <button type="button" onClick={handleResetDefaultFields} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600">
            Restaurar
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={handleAddText} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors"><Type size={14} /> Texto</button>
          <button type="button" onClick={handleAddBox} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors"><Square size={14} /> Caixa</button>
          <button type="button" onClick={handleAddLine} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors"><Minus size={14} /> Linha</button>
          <button type="button" onClick={handleAddShape} className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors"><Square size={14} /> Forma</button>
          {page === 'frente' && (
            <button type="button" onClick={handleAddPhoto} className="col-span-2 flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 rounded-xl text-xs font-bold text-slate-700 transition-colors"><ImageIcon size={14} /> Foto do aluno</button>
          )}
        </div>

        {page === 'verso' && (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Inserir assinatura cadastrada</p>
              <p className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-400">Busca a imagem salva em Configurações → Assinaturas.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SIGNATURE_ROLES.map((role) => (
                <button key={role.id} type="button" disabled={signatureLoadingRole !== null} onClick={() => handleAddSignature(role.id, role.label)} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-2 text-[10px] font-bold text-slate-700 transition-colors hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700 disabled:cursor-wait disabled:opacity-55">
                  {signatureLoadingRole === role.id ? <Loader2 size={13} className="animate-spin" /> : <FileSignature size={13} />}
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Elementos na {page === 'frente' ? 'Frente' : 'Verso'}</label>
        <div className="flex flex-col gap-1 max-h-[230px] overflow-y-auto custom-scrollbar">
          {(formData.fields || []).filter((field: any) => (field.page || 'frente') === page).map((field: any) => {
            const isSelected = selectedFieldId === field.id;
            return (
              <button key={field.id} type="button" onClick={() => setSelectedFieldId(field.id)} className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold transition-all flex items-center justify-between gap-2 ${isSelected ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                <span className="min-w-0 flex-1 flex items-center gap-2"><ElementIcon type={field.type} /><span className="truncate">{getFieldDescription(field)}</span></span>
                <span className="text-[9px] font-mono opacity-60 shrink-0">X:{Math.round(Number(field.x || 0))}% Y:{Math.round(Number(field.y || 0))}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CrachaPeriodoEleitoralElementsPanel;

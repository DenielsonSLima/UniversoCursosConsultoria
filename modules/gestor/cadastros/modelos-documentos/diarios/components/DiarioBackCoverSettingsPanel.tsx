import React from 'react';
import { Loader2, Upload } from 'lucide-react';
import { DiarioTemplate } from '../diarios.service';
import { DiarioSignatureRole, DiarioUploadKind } from '../diarios-editor.types';

interface DiarioBackCoverSettingsPanelProps {
  applyCentralSignature: (slot: 1 | 2, roleId: DiarioSignatureRole) => void;
  contracapaCustomImageRef: React.RefObject<HTMLInputElement | null>;
  form: DiarioTemplate;
  setForm: React.Dispatch<React.SetStateAction<DiarioTemplate>>;
  uploading: DiarioUploadKind | null;
}

const signatureRoles = [
  { id: 'diretoriaGeral', label: 'Diretoria' },
  { id: 'secretaria', label: 'Secretaria' },
  { id: 'coordenacao', label: 'Coordenação' },
  { id: 'financeiro', label: 'Financeiro' },
] as const;

const DiarioBackCoverSettingsPanel: React.FC<DiarioBackCoverSettingsPanelProps> = ({
  applyCentralSignature,
  contracapaCustomImageRef,
  form,
  setForm,
  uploading,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
    <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
      Configurar Contracapa
    </h5>

    <label className="flex items-center gap-3 cursor-pointer pb-2 border-b border-slate-100">
      <input
        type="checkbox"
        checked={form.imprimirValidacaoContracapa || false}
        onChange={(event) => setForm({ ...form, imprimirValidacaoContracapa: event.target.checked })}
        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
      />
      <div>
        <span className="block text-xs font-bold text-slate-800">Imprimir Validação no Verso</span>
        <span className="text-[10px] text-slate-500 font-medium">Habilita o cartão de validação.</span>
      </div>
    </label>

    <label className="block">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
        Mensagem de Validação / Regulamento
      </span>
      <textarea
        value={form.mensagemValidacao || ''}
        onChange={(event) => setForm({ ...form, mensagemValidacao: event.target.value })}
        rows={3}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:bg-white resize-none"
      />
    </label>

    <SignatureSettings
      cargo={form.diretorCargo || ''}
      cargoPlaceholder="Ex: Diretor Geral"
      name={form.diretorNome || ''}
      namePlaceholder="Ex: Prof. Denielson S. Lima"
      onCargoChange={(value) => setForm({ ...form, diretorCargo: value })}
      onNameChange={(value) => setForm({ ...form, diretorNome: value })}
      onSelectRole={(roleId) => applyCentralSignature(1, roleId)}
      selectedRole={form.diretorAssinaturaRole}
      slot={1}
      title="ASSINATURA 1 (ESQUERDA)"
    />
    <SignatureSettings
      cargo={form.secretarioCargo || ''}
      cargoPlaceholder="Ex: Secretária Acadêmica"
      name={form.secretarioNome || ''}
      namePlaceholder="Ex: Maria Eduarda Santos"
      onCargoChange={(value) => setForm({ ...form, secretarioCargo: value })}
      onNameChange={(value) => setForm({ ...form, secretarioNome: value })}
      onSelectRole={(roleId) => applyCentralSignature(2, roleId)}
      selectedRole={form.secretarioAssinaturaRole}
      slot={2}
      title="ASSINATURA 2 (DIREITA)"
    />

    <div className="border-t border-slate-100 pt-3 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">LOGOTIPOS E IMAGENS</p>
      <button
        type="button"
        onClick={() => contracapaCustomImageRef.current?.click()}
        disabled={uploading === 'contracapa_custom'}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 py-3 text-xs font-bold text-slate-700 transition"
      >
        {uploading === 'contracapa_custom' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        Adicionar Logotipo / Imagem
      </button>
    </div>

    <div className="border-t border-slate-100 pt-3">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tamanho do QR Code (mm)</span>
        <span className="text-xs font-bold text-slate-700">{form.qrCodeSize || 28}mm</span>
      </div>
      <input
        type="range"
        min="20"
        max="50"
        value={form.qrCodeSize || 28}
        onChange={(event) => setForm({ ...form, qrCodeSize: parseInt(event.target.value) })}
        className="w-full accent-blue-600"
      />
    </div>
  </div>
);

interface SignatureSettingsProps {
  cargo: string;
  cargoPlaceholder: string;
  name: string;
  namePlaceholder: string;
  onCargoChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSelectRole: (roleId: DiarioSignatureRole) => void;
  selectedRole?: DiarioSignatureRole | null;
  slot: 1 | 2;
  title: string;
}

const SignatureSettings: React.FC<SignatureSettingsProps> = ({
  cargo,
  cargoPlaceholder,
  name,
  namePlaceholder,
  onCargoChange,
  onNameChange,
  onSelectRole,
  selectedRole,
  slot,
  title,
}) => (
  <div className="border-t border-slate-100 pt-3 space-y-3">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">{title}</p>
    <div className="grid gap-2">
      <label className="block">
        <span className="mb-0.5 block text-[9px] font-bold text-slate-400 uppercase">Nome do Assinante</span>
        <input
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder={namePlaceholder}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
        />
      </label>
      <label className="block">
        <span className="mb-0.5 block text-[9px] font-bold text-slate-400 uppercase">Cargo / Função</span>
        <input
          type="text"
          value={cargo}
          onChange={(event) => onCargoChange(event.target.value)}
          placeholder={cargoPlaceholder}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
        />
      </label>
    </div>
    <div className="flex flex-col gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
      <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">USAR ASSINATURA CENTRAL</span>
      <div className="grid grid-cols-2 gap-1">
        {signatureRoles.map((role) => (
          <button
            key={`s${slot}-${role.id}`}
            type="button"
            onClick={() => onSelectRole(role.id)}
            className={`py-1 px-1.5 rounded-lg border text-[9px] font-bold transition-all truncate ${
              selectedRole === role.id
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm font-black'
                : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
          >
            {role.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);

export default DiarioBackCoverSettingsPanel;

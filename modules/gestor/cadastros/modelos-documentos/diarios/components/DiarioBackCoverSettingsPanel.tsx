import React from 'react';
import { Loader2, PenLine, Upload } from 'lucide-react';
import { DiarioTemplate } from '../diarios.service';
import { DiarioUploadKind } from '../diarios-editor.types';

interface DiarioBackCoverSettingsPanelProps {
  contracapaCustomImageRef: React.RefObject<HTMLInputElement | null>;
  form: DiarioTemplate;
  setForm: React.Dispatch<React.SetStateAction<DiarioTemplate>>;
  uploading: DiarioUploadKind | null;
}

const DiarioBackCoverSettingsPanel: React.FC<DiarioBackCoverSettingsPanelProps> = ({
  contracapaCustomImageRef,
  form,
  setForm,
  uploading,
}) => {
  const qrField = form.contracapaCampos?.find((field) => field.id === 'contracapaQrCode');
  const qrSizeMm = Math.round(((qrField?.width || 18) / 100) * 297);
  const updateQrSize = (sizeMm: number) => {
    const width = Number(((sizeMm / 297) * 100).toFixed(1));
    setForm((previous) => ({
      ...previous,
      // Campo legado do snapshot; o tamanho visual exato vem da largura vetorial abaixo.
      qrCodeSize: Math.min(50, sizeMm),
      contracapaCampos: previous.contracapaCampos?.map((field) => (
        field.id === 'contracapaQrCode' ? { ...field, width } : field
      )),
    }));
  };

  return (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
    <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
      Configurar Contracapa
    </h5>

    <label className="flex items-center gap-3 pb-2 border-b border-slate-100">
      <input
        type="checkbox"
        checked
        readOnly
        disabled
        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
      />
      <div>
        <span className="block text-xs font-bold text-slate-800">Página 2 de validação obrigatória</span>
        <span className="text-[10px] text-slate-500 font-medium">Mantém os campos e as duas assinaturas posicionados no documento assinável.</span>
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

    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <div className="mb-2 flex items-center gap-2 text-blue-800">
        <PenLine size={15} />
        <p className="text-[10px] font-black uppercase tracking-widest">Assinaturas manuais da contracapa</p>
      </div>
      <p className="text-[10px] font-semibold leading-relaxed text-blue-700">
        Todos os campos visíveis são arrastáveis. Selecione também as linhas de <strong>ASSINATURA DO PROFESSOR</strong> e{' '}
        <strong>ASSINATURA DO COORDENADOR DO CURSO</strong>. Posição, largura, estilo e alinhamento
        salvos neste modelo serão usados no PDF.
      </p>
    </div>

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
        <span className="text-xs font-bold text-slate-700">{qrSizeMm}mm</span>
      </div>
      <input
        type="range"
        min="20"
        max="70"
        value={qrSizeMm}
        onChange={(event) => updateQrSize(parseInt(event.target.value, 10))}
        className="w-full accent-blue-600"
      />
    </div>
  </div>
  );
};

export default DiarioBackCoverSettingsPanel;

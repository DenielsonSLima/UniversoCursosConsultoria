import React from 'react';
import { Loader2, Upload } from 'lucide-react';
import type { CarteirinhaEditorPanelProps } from './carteirinha-editor.types';

export const CarteirinhaEditorConfigPanel: React.FC<Pick<CarteirinhaEditorPanelProps, 'formData' | 'handleChange'>> = ({ formData, handleChange }) => (
  <div className="space-y-5 animate-fadeIn">
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Nome do Modelo <span className="text-red-500">*</span></label>
      <input type="text" name="nome" value={formData.nome} onChange={handleChange} placeholder="Ex: Carteirinha Ensino Técnico" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-pink-500 focus:bg-white" />
    </div>
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Número Sequencial Inicial</label>
      <input type="number" name="startNumber" value={formData.startNumber || 1000} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-pink-500 focus:bg-white" />
      <p className="mt-1 text-[9px] font-bold uppercase leading-normal tracking-widest text-slate-400">As novas carteirinhas emitidas iniciarão a contagem sequencial a partir deste número.</p>
    </div>
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Tipo de Curso</label>
      <select name="tipoCurso" value={formData.tipoCurso} onChange={handleChange} className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-pink-500 focus:bg-white">
        <option value="Cursos Técnicos">Cursos Técnicos</option>
        <option value="Ensino Superior">Ensino Superior (Graduação/Pós)</option>
        <option value="Educação a Distância (EAD)">Educação a Distância (EAD)</option>
        <option value="Cursos Livres">Cursos Livres / Extensão (Uso Interno)</option>
      </select>
    </div>
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Status</label>
      <select name="status" value={formData.status} onChange={handleChange} className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-pink-500 focus:bg-white">
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </select>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div><label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Cor Primária</label><input type="color" name="corPrimaria" value={formData.corPrimaria} onChange={handleChange} className="h-12 w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-1" /></div>
      <div><label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Cor Secundária</label><input type="color" name="corSecundaria" value={formData.corSecundaria} onChange={handleChange} className="h-12 w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-1" /></div>
    </div>
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50">
      <input type="checkbox" name="hasVerso" checked={formData.hasVerso} onChange={handleChange} className="h-5 w-5 rounded text-pink-600" />
      <div><span className="block text-sm font-bold uppercase text-[#001a33]">Ter verso impresso</span><span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Informações legais, QR Code e regras.</span></div>
    </label>
  </div>
);

export const CarteirinhaEditorFrontPanel: React.FC<CarteirinhaEditorPanelProps> = ({
  formData,
  handleChange,
  handleUploadFile,
  isUploading,
  setFormData,
}) => (
  <div className="space-y-5 animate-fadeIn">
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Título do Documento (Cabeçalho)</label>
      <input type="text" name="textoFrente" value={formData.textoFrente} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 outline-none transition-all focus:border-pink-500 focus:bg-white" />
    </div>
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-500">Imagem de Fundo (Frente) — Photoshop</label>
      <div className="flex gap-2">
        <input type="text" name="bgFrenteUrl" placeholder="URL da imagem de fundo (.png / .jpg)" value={formData.bgFrenteUrl || ''} onChange={handleChange} className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 outline-none transition-all focus:border-pink-500 focus:bg-white" />
        <label className="relative flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-100 p-3 transition-colors hover:bg-pink-50 hover:text-pink-600">
          <input type="file" accept="image/*" onChange={(event) => handleUploadFile(event, 'bgFrenteUrl')} className="absolute inset-0 cursor-pointer opacity-0" disabled={isUploading} />
          {isUploading ? <Loader2 size={18} className="animate-spin text-pink-600" /> : <Upload size={18} />}
        </label>
      </div>
      <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">Recomendado: 856 x 540 pixels (.png transparente ou opaco)</p>
    </div>

    {(Boolean(formData.bgFrenteUrl) || Boolean(formData.bgVersoUrl)) && (
      <div className="space-y-4 rounded-xl border border-pink-100 bg-pink-50/20 p-4 animate-fadeIn">
        <label className="flex cursor-pointer items-center gap-3 rounded p-1 transition-colors hover:bg-slate-50/50"><input type="checkbox" name="usePhotoshopLayout" checked={formData.usePhotoshopLayout || false} onChange={handleChange} className="h-5 w-5 rounded text-pink-600" /><div><span className="block text-sm font-bold uppercase text-[#001a33]">Ativar Layout Photoshop</span><span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Alinha textos e fotos de forma absoluta permitindo o arrasto livre.</span></div></label>
        <label className="flex cursor-pointer items-center gap-3 rounded p-1 transition-colors hover:bg-slate-50/50"><input type="checkbox" name="ocultarDesignPadrao" checked={formData.ocultarDesignPadrao || false} onChange={handleChange} className="h-5 w-5 rounded text-pink-600" /><div><span className="block text-sm font-bold uppercase text-[#001a33]">Usar Apenas Fundo Customizado</span><span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Oculta as faixas e fundos padrão para exibir apenas o design do Photoshop.</span></div></label>
        <label className="flex cursor-pointer items-center gap-3 rounded p-1 transition-colors hover:bg-slate-50/50"><input type="checkbox" name="exibirRotulos" checked={formData.exibirRotulos !== false} onChange={handleChange} className="h-5 w-5 rounded text-pink-600" /><div><span className="block text-sm font-bold uppercase text-[#001a33]">Exibir Rótulos nos Dados</span><span className="mt-0.5 block text-[9px] font-bold uppercase tracking-widest text-slate-500">Mostra legendas (ex: "NOME:") antes dos valores dos campos.</span></div></label>

        {Boolean(formData.usePhotoshopLayout) && (
          <div className="mt-4 space-y-4 border-t border-pink-100 pt-4 animate-fadeIn">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#001a33]">Estilização do Layout</h4>
            <div><label className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Cor das Fontes</span><span className="font-mono">{formData.corTexto || '#1e293b'}</span></label><input type="color" name="corTexto" value={formData.corTexto || '#1e293b'} onChange={handleChange} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-slate-50 p-0.5" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Fonte Nome</span><span className="font-mono">{formData.tamanhoFonteNome || 8.5}px</span></label><input type="range" name="tamanhoFonteNome" min="6" max="16" step="0.5" value={formData.tamanhoFonteNome || 8.5} onChange={(event) => setFormData({ ...formData, tamanhoFonteNome: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-250 accent-pink-600" /></div>
              <div><label className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Fonte Dados</span><span className="font-mono">{formData.tamanhoFonteDados || 7}px</span></label><input type="range" name="tamanhoFonteDados" min="5" max="14" step="0.5" value={formData.tamanhoFonteDados || 7} onChange={(event) => setFormData({ ...formData, tamanhoFonteDados: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-250 accent-pink-600" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Largura Foto</span><span className="font-mono">{formData.fotoWidth || 18.5}%</span></label><input type="range" name="fotoWidth" min="10" max="35" step="0.5" value={formData.fotoWidth || 18.5} onChange={(event) => setFormData({ ...formData, fotoWidth: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-250 accent-pink-600" /></div>
              <div><label className="mb-1.5 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Altura Foto</span><span className="font-mono">{formData.fotoHeight || 44}%</span></label><input type="range" name="fotoHeight" min="20" max="60" step="0.5" value={formData.fotoHeight || 44} onChange={(event) => setFormData({ ...formData, fotoHeight: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-250 accent-pink-600" /></div>
            </div>
          </div>
        )}
      </div>
    )}

    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between"><div><h4 className="text-xs font-black uppercase tracking-widest text-[#001a33]">Código abaixo do QR</h4><p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Permite digitar o código no site quando a câmera não conseguir ler o QR</p></div><label className="relative inline-flex cursor-pointer items-center"><input type="checkbox" name="showValidationCode" checked={formData.showValidationCode !== false} onChange={handleChange} className="peer sr-only" /><div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:bg-white after:transition-all after:content-[''] peer-checked:bg-pink-600 peer-checked:after:translate-x-full" /></label></div>
      {formData.showValidationCode !== false && (
        <div className="space-y-3 border-t border-slate-100 pt-2">
          <div><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Rótulo</label><input type="text" name="rotuloCodigoValidacao" value={formData.rotuloCodigoValidacao} onChange={handleChange} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 outline-none focus:border-pink-500" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Tamanho</span><span className="font-mono">{Number(formData.tamanhoFonteCodigoValidacao || 4.2).toFixed(1)}px</span></label><input type="range" min="3" max="10" step="0.2" value={formData.tamanhoFonteCodigoValidacao || 4.2} onChange={(event) => setFormData({ ...formData, tamanhoFonteCodigoValidacao: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-pink-600" /></div>
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Cor</span><span className="font-mono">{formData.corCodigoValidacao}</span></label><input type="color" name="corCodigoValidacao" value={formData.corCodigoValidacao || '#1e293b'} onChange={handleChange} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" /></div>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-pink-600">No preview, arraste o código para ajustar sua posição.</p>
        </div>
      )}
    </div>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-[10px] font-bold uppercase leading-relaxed tracking-widest text-slate-600">Os dados do aluno (Foto, Nome, CPF, RG, Nascimento, Curso, Matrícula) flutuarão por cima do fundo.</p></div>
  </div>
);

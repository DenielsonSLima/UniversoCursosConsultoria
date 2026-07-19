import React from 'react';
import type { CarteirinhaEditorPanelProps } from './carteirinha-editor.types';

interface CarteirinhaEditorBackValidationPanelProps extends Pick<CarteirinhaEditorPanelProps, 'formData' | 'handleChange' | 'setFormData'> {
  institutionalData?: {
    razaoSocial?: string;
    cnpj?: string;
    telefone?: string;
  } | null;
}

const Toggle = ({ checked, name, onChange }: {
  checked: boolean;
  name: string;
  onChange: CarteirinhaEditorPanelProps['handleChange'];
}) => (
  <label className="relative inline-flex cursor-pointer items-center">
    <input type="checkbox" name={name} checked={checked} onChange={onChange} className="peer sr-only" />
    <div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-pink-600 peer-checked:after:translate-x-full peer-checked:after:border-white" />
  </label>
);

const CarteirinhaEditorBackValidationPanel: React.FC<CarteirinhaEditorBackValidationPanelProps> = ({
  formData,
  handleChange,
  institutionalData,
  setFormData,
}) => (
  <>
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between"><div><h4 className="text-xs font-black uppercase tracking-widest text-[#001a33]">Dados automáticos do polo</h4><p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Razão social, CNPJ e telefone vêm do cadastro do polo/empresa</p></div><Toggle name="showInstitutionalData" checked={formData.showInstitutionalData !== false} onChange={handleChange} /></div>
      {formData.showInstitutionalData !== false && (
        <div className="space-y-3 border-t border-slate-100 pt-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[10px] font-bold leading-relaxed text-blue-800">
            {institutionalData ? <><p>{institutionalData.razaoSocial}</p><p>CNPJ: {institutionalData.cnpj || 'Não cadastrado'}</p><p>Contato: {institutionalData.telefone || 'Não cadastrado'}</p></> : 'Selecione/cadastre o polo ativo para visualizar os dados automáticos.'}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Tamanho</span><span className="font-mono">{Number(formData.tamanhoFonteDadosInstitucionais || 5.2).toFixed(1)}px</span></label><input type="range" min="3" max="10" step="0.2" value={formData.tamanhoFonteDadosInstitucionais || 5.2} onChange={(event) => setFormData({ ...formData, tamanhoFonteDadosInstitucionais: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-pink-600" /></div>
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Cor</span><span className="font-mono">{formData.corDadosInstitucionais}</span></label><input type="color" name="corDadosInstitucionais" value={formData.corDadosInstitucionais || '#1e293b'} onChange={handleChange} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" /></div>
          </div>
          <div className="flex gap-2">{(['left', 'center', 'right'] as const).map((align) => <button key={align} type="button" onClick={() => setFormData({ ...formData, alinhamentoDadosInstitucionais: align })} className={`flex-1 rounded-lg border py-2 text-[9px] font-black uppercase ${formData.alinhamentoDadosInstitucionais === align ? 'border-pink-300 bg-pink-50 text-pink-600' : 'border-slate-200 bg-white text-slate-500'}`}>{align === 'left' ? 'Esquerda' : align === 'center' ? 'Centro' : 'Direita'}</button>)}</div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-pink-600">No preview do verso, arraste o bloco para ajustar sua posição.</p>
        </div>
      )}
    </div>

    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between"><div><h4 className="text-xs font-black uppercase tracking-widest text-[#001a33]">Site de Validação</h4><p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Exibe a URL para validação de autenticidade</p></div><Toggle name="showSiteValidador" checked={formData.showSiteValidador !== false} onChange={handleChange} /></div>
      {formData.showSiteValidador !== false && (
        <div className="space-y-3 border-t border-slate-100 pt-2">
          <div><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">URL do Validador</label><input type="text" name="siteValidadorUrl" value={formData.siteValidadorUrl} onChange={handleChange} placeholder="Ex: www.universocc.com.br" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 outline-none transition-all focus:border-pink-500 focus:bg-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Tamanho Fonte</span><span className="font-mono">{(formData.tamanhoFonteValidador || 6).toFixed(1)}px</span></label><input type="range" name="tamanhoFonteValidador" min="3" max="12" step="0.2" value={formData.tamanhoFonteValidador || 6} onChange={(event) => setFormData({ ...formData, tamanhoFonteValidador: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-pink-600" /></div>
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Cor do Texto</span><span className="font-mono">{formData.corTextoValidador || '#1e293b'}</span></label><input type="color" name="corTextoValidador" value={formData.corTextoValidador || '#1e293b'} onChange={handleChange} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" /></div>
          </div>
        </div>
      )}
    </div>

    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex items-center justify-between"><div><h4 className="text-xs font-black uppercase tracking-widest text-[#001a33]">Data de Emissão</h4><p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Exibe a data de emissão no documento</p></div><Toggle name="showDataEmissao" checked={formData.showDataEmissao !== false} onChange={handleChange} /></div>
      {formData.showDataEmissao !== false && (
        <div className="space-y-3 border-t border-slate-100 pt-2">
          <div><label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">Texto/Formato da Emissão</label><input type="text" name="dataEmissaoTexto" value={formData.dataEmissaoTexto} onChange={handleChange} placeholder="Ex: EMISSÃO: 18/06/2026" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 outline-none transition-all focus:border-pink-500 focus:bg-white" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Tamanho Fonte</span><span className="font-mono">{(formData.tamanhoFonteEmissao || 5.5).toFixed(1)}px</span></label><input type="range" name="tamanhoFonteEmissao" min="3" max="12" step="0.2" value={formData.tamanhoFonteEmissao || 5.5} onChange={(event) => setFormData({ ...formData, tamanhoFonteEmissao: Number.parseFloat(event.target.value) })} className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-pink-600" /></div>
            <div><label className="mb-1 flex justify-between text-[9px] font-bold uppercase tracking-widest text-slate-500"><span>Cor do Texto</span><span className="font-mono">{formData.corTextoEmissao || '#ef4444'}</span></label><input type="color" name="corTextoEmissao" value={formData.corTextoEmissao || '#ef4444'} onChange={handleChange} className="h-8 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-0.5" /></div>
          </div>
        </div>
      )}
    </div>
  </>
);

export default CarteirinhaEditorBackValidationPanel;

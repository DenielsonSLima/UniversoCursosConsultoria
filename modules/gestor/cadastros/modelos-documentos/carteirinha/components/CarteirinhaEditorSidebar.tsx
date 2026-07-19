import React from 'react';
import { HelpCircle, ShieldCheck } from 'lucide-react';
import CarteirinhaEditorBackIdentityPanel from './CarteirinhaEditorBackIdentityPanel';
import CarteirinhaEditorBackValidationPanel from './CarteirinhaEditorBackValidationPanel';
import { CarteirinhaEditorConfigPanel, CarteirinhaEditorFrontPanel } from './CarteirinhaEditorPrimaryPanels';
import type { CarteirinhaEditorPanelProps, CarteirinhaEditorTab } from './carteirinha-editor.types';

interface CarteirinhaEditorSidebarProps extends CarteirinhaEditorPanelProps {
  activeTab: CarteirinhaEditorTab;
  institutionalData?: {
    razaoSocial?: string;
    cnpj?: string;
    telefone?: string;
  } | null;
  setActiveTab: React.Dispatch<React.SetStateAction<CarteirinhaEditorTab>>;
}

const CertificatePanel = () => (
  <div className="space-y-5 animate-fadeIn">
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/50 p-5">
      <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-[#001a33]"><ShieldCheck size={18} className="text-pink-600" />Assinatura Digital ICP-Brasil</h4>
      <div className="space-y-3 text-xs font-medium leading-relaxed text-slate-500">
        <p>Sim! Um <strong>Certificado Digital corporativo (A1 ou A3)</strong> pode assinar e selar as carteirinhas de forma automática na emissão do documento.</p>
        <p><strong>Como funcionaria a assinatura automática?</strong><br />No momento em que a secretaria clica em "Emitir CIE", o servidor envia o arquivo PDF gerado para um serviço criptográfico que sela o documento digitalmente com o par de chaves da instituição.</p>
        <p><strong>Validade Jurídica:</strong><br />A assinatura atesta a integridade do PDF nos termos da MP 2.200-2/2001, inviabilizando falsificações digitais.</p>
      </div>
      <div className="space-y-3 border-t border-slate-200/60 pt-4">
        <div className="flex items-center justify-between"><div><span className="block text-xs font-bold uppercase text-[#001a33]">Selo Digital Automatizado</span><span className="mt-0.5 block text-[8px] font-bold uppercase leading-none tracking-widest text-slate-400">Assinar novos lotes em PDF via API</span></div><span className="rounded-md bg-pink-100 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-pink-700">Em Breve</span></div>
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3"><HelpCircle size={16} className="mt-0.5 shrink-0 text-pink-600" /><p className="text-[9px] font-bold uppercase leading-normal tracking-wider text-slate-400">Quer habilitar a assinatura com certificado A1 no seu portal? Fale com a equipe de TI da Universo.</p></div>
      </div>
    </div>
  </div>
);

const CarteirinhaEditorSidebar: React.FC<CarteirinhaEditorSidebarProps> = (props) => {
  const tabs: Array<{ key: CarteirinhaEditorTab; label: string }> = [
    { key: 'config', label: 'Config' },
    { key: 'frente', label: 'Frente' },
    { key: 'verso', label: 'Verso' },
    { key: 'certificado', label: 'Certificado' },
  ];

  return (
    <div className="flex w-full flex-col gap-6 xl:w-[400px]">
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map(({ key, label }) => <button key={key} onClick={() => props.setActiveTab(key)} className={`flex-1 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${props.activeTab === key ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
        {props.activeTab === 'config' && <CarteirinhaEditorConfigPanel formData={props.formData} handleChange={props.handleChange} />}
        {props.activeTab === 'frente' && <CarteirinhaEditorFrontPanel {...props} />}
        {props.activeTab === 'verso' && props.formData.hasVerso && <div className="space-y-5 animate-fadeIn"><CarteirinhaEditorBackIdentityPanel {...props} /><CarteirinhaEditorBackValidationPanel formData={props.formData} handleChange={props.handleChange} setFormData={props.setFormData} institutionalData={props.institutionalData} /></div>}
        {props.activeTab === 'certificado' && <CertificatePanel />}
        {props.activeTab === 'verso' && !props.formData.hasVerso && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500"><p className="text-xs font-bold uppercase tracking-widest">O verso está desabilitado na aba de configuração.</p></div>}
      </div>
    </div>
  );
};

export default CarteirinhaEditorSidebar;

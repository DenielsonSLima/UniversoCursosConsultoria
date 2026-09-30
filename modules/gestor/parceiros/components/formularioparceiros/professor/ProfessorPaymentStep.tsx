import React from 'react';
import { DollarSign } from 'lucide-react';
import {
  BANCOS,
  PIX_KEY_OPTIONS,
  PRESET_VINCULOS,
  pixKeyPlaceholder,
  type ProfessorFormData,
} from './professor-form.model';

interface ProfessorPaymentStepProps {
  formData: ProfessorFormData;
  inputCls: string;
  labelCls: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
}

const ProfessorPaymentStep: React.FC<ProfessorPaymentStepProps> = ({
  formData,
  inputCls,
  labelCls,
  onChange,
}) => (
  <div className="space-y-5">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-emerald-600">
      <DollarSign size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Vínculo e dados para pagamento</h4>
    </div>

    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={labelCls}>Tipo de vínculo</label>
        <select name="tipoVinculo" value={formData.tipoVinculo} onChange={onChange} className={inputCls}>
          <option value="">Selecione...</option>
          {PRESET_VINCULOS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div className="md:col-span-2">
        <div className="my-2 h-px bg-slate-100" />
        <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Dados Pix opcionais</p>
      </div>
      <div>
        <label className={labelCls}>Tipo da chave Pix</label>
        <select name="tipoChavePix" value={formData.tipoChavePix} onChange={onChange} className={inputCls}>
          <option value="">Selecione o tipo...</option>
          {PIX_KEY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Chave Pix</label>
        <input
          type={formData.tipoChavePix === 'EMAIL' ? 'email' : 'text'}
          name="chavePix"
          value={formData.chavePix}
          onChange={onChange}
          className={inputCls}
          placeholder={pixKeyPlaceholder(formData.tipoChavePix)}
          disabled={!formData.tipoChavePix}
          inputMode={['CPF', 'PHONE'].includes(formData.tipoChavePix) ? 'numeric' : 'text'}
        />
      </div>
      <div className="md:col-span-2">
        <p className="text-xs text-slate-500">A máscara e a validação mudam conforme o tipo selecionado.</p>
      </div>

      <div className="md:col-span-2">
        <div className="my-1 h-px bg-slate-100" />
        <p className="mb-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Ou dados bancários opcionais</p>
      </div>
      <div>
        <label className={labelCls}>Banco</label>
        <select name="banco" value={formData.banco} onChange={onChange} className={inputCls}>
          <option value="">Selecione o banco...</option>
          {BANCOS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <div>
        <label className={labelCls}>Tipo de conta</label>
        <select name="tipoConta" value={formData.tipoConta} onChange={onChange} className={inputCls}>
          <option value="">Selecione...</option>
          <option value="CORRENTE">Corrente</option>
          <option value="POUPANÇA">Poupança</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Agência</label>
        <input type="text" name="agencia" value={formData.agencia} onChange={onChange} className={inputCls} placeholder="0000" />
      </div>
      <div>
        <label className={labelCls}>Número da conta</label>
        <input type="text" name="conta" value={formData.conta} onChange={onChange} className={inputCls} placeholder="00000-0" />
      </div>
    </div>
  </div>
);

export default ProfessorPaymentStep;

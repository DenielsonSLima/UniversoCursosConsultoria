import React from 'react';
import { AlertCircle, FileText, Mail, MapPin, Phone } from 'lucide-react';
import { UFS, type ProfessorFormData } from './professor-form.model';

interface ProfessorContactStepProps {
  formData: ProfessorFormData;
  inputCls: string;
  labelCls: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  onCepBlur: () => void;
}

const ProfessorContactStep: React.FC<ProfessorContactStepProps> = ({
  formData,
  inputCls,
  labelCls,
  onChange,
  onCepBlur,
}) => (
  <div className="space-y-6">
    <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-violet-600">
      <MapPin size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Endereço opcional</h4>
    </div>
    <div className="grid grid-cols-1 gap-5 md:grid-cols-4">
      <div>
        <label className={labelCls}>CEP</label>
        <input type="text" name="cep" value={formData.cep} onChange={onChange} onBlur={onCepBlur} maxLength={9} className={inputCls} placeholder="00000-000" inputMode="numeric" />
      </div>
      <div className="md:col-span-3">
        <label className={labelCls}>Endereço</label>
        <input type="text" name="endereco" value={formData.endereco} onChange={onChange} className={inputCls} placeholder="Rua / Avenida" />
      </div>
      <div>
        <label className={labelCls}>Número</label>
        <input type="text" name="numero" value={formData.numero} onChange={onChange} className={inputCls} placeholder="123" />
      </div>
      <div>
        <label className={labelCls}>Complemento</label>
        <input type="text" name="complemento" value={formData.complemento} onChange={onChange} className={inputCls} placeholder="Apto, bloco..." />
      </div>
      <div className="md:col-span-2">
        <label className={labelCls}>Bairro</label>
        <input type="text" name="bairro" value={formData.bairro} onChange={onChange} className={inputCls} placeholder="Bairro" />
      </div>
      <div className="md:col-span-3">
        <label className={labelCls}>Cidade</label>
        <input type="text" name="cidade" value={formData.cidade} onChange={onChange} className={inputCls} placeholder="Nome da cidade" />
      </div>
      <div>
        <label className={labelCls}>UF</label>
        <select name="uf" value={formData.uf} onChange={onChange} className={inputCls}>
          <option value="">UF</option>
          {UFS.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
    </div>

    <div className="flex items-center gap-2 border-b border-slate-100 pb-2 text-violet-600">
      <Phone size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Contato e acesso opcionais</h4>
    </div>
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="md:col-span-2">
        <label className={labelCls}><Mail size={12} className="mr-1 inline" />E-mail de acesso</label>
        <input type="email" name="email" value={formData.email} onChange={onChange} className={inputCls} placeholder="professor@email.com" />
        <p className="ml-0.5 mt-1 flex items-center gap-1 text-[10px] text-slate-400">
          <AlertCircle size={10} /> Quando informado, o professor receberá o convite no endereço digitado.
        </p>
      </div>
      <div>
        <label className={labelCls}>Celular / WhatsApp</label>
        <input type="tel" name="contato1" value={formData.contato1} onChange={onChange} maxLength={15} className={inputCls} placeholder="(00) 00000-0000" inputMode="tel" />
      </div>
      <div>
        <label className={labelCls}>Telefone secundário</label>
        <input type="tel" name="contato2" value={formData.contato2} onChange={onChange} maxLength={15} className={inputCls} placeholder="(00) 00000-0000" inputMode="tel" />
      </div>
    </div>

    <div>
      <label className={labelCls}><FileText size={12} className="mr-1 inline" />Observações internas</label>
      <textarea name="observacao" value={formData.observacao} onChange={onChange} rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-all focus:border-violet-400" placeholder="Disponibilidade de horários, restrições, etc..." />
    </div>
  </div>
);

export default ProfessorContactStep;

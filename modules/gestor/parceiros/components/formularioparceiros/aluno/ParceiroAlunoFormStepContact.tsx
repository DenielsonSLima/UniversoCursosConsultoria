import type React from 'react';
import { AlertCircle, FileText, Mail, MapPin, Phone } from 'lucide-react';

import { INPUT_CLS, LABEL_CLS, sectionHeaderCls, UFS } from './parceiro-aluno-form.constants';
import type { AlunoFormStepProps } from './parceiro-aluno-form.types';

interface ContactStepProps extends AlunoFormStepProps {
  onCepBlur: () => void;
}

const ParceiroAlunoFormStepContact: React.FC<ContactStepProps> = ({ formData, onCepBlur, onChange }) => (
  <div className="space-y-6 ">
    <div className={sectionHeaderCls('violet')}>
      <MapPin size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Endereço Completo</h4>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div>
        <label className={LABEL_CLS}>CEP <span className="text-red-500">*</span></label>
        <input type="text" name="cep" value={formData.cep} onChange={onChange} onBlur={onCepBlur}
          maxLength={9} className={INPUT_CLS} placeholder="00000-000" required />
      </div>

      <div className="md:col-span-3">
        <label className={LABEL_CLS}>Endereço (Rua/Av) <span className="text-red-500">*</span></label>
        <input type="text" name="endereco" value={formData.endereco} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome da rua" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Número <span className="text-red-500">*</span></label>
        <input type="text" name="numero" value={formData.numero} onChange={onChange}
          className={INPUT_CLS} placeholder="123" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Complemento</label>
        <input type="text" name="complemento" value={formData.complemento} onChange={onChange}
          className={INPUT_CLS} placeholder="Apto, Bloco..." />
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Bairro <span className="text-red-500">*</span></label>
        <input type="text" name="bairro" value={formData.bairro} onChange={onChange}
          className={INPUT_CLS} placeholder="Bairro" required />
      </div>

      <div className="md:col-span-3">
        <label className={LABEL_CLS}>Cidade <span className="text-red-500">*</span></label>
        <input type="text" name="cidade" value={formData.cidade} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome da cidade" required />
      </div>

      <div>
        <label className={LABEL_CLS}>UF <span className="text-red-500">*</span></label>
        <select name="uf" value={formData.uf} onChange={onChange} className={INPUT_CLS} required>
          <option value="">UF</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>
    </div>

    <div className={sectionHeaderCls('violet')}>
      <Phone size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Contato</h4>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="md:col-span-2">
        <label className={LABEL_CLS}><Mail size={12} className="inline mr-1" />E-mail <span className="text-red-500">*</span></label>
        <input type="email" name="email" value={formData.email} onChange={onChange}
          className={INPUT_CLS} placeholder="aluno@email.com" required />
        <p className="text-[10px] text-slate-400 mt-1 ml-0.5 flex items-center gap-1">
          <AlertCircle size={10} />Boleto e acesso ao portal serão enviados para este e-mail.
        </p>
      </div>

      <div>
        <label className={LABEL_CLS}>Celular / WhatsApp <span className="text-red-500">*</span></label>
        <input type="tel" name="contato1" value={formData.contato1} onChange={onChange}
          maxLength={15} className={INPUT_CLS} placeholder="(00) 00000-0000" required />
      </div>

      <div>
        <label className={LABEL_CLS}>Telefone de Recado (Opcional)</label>
        <input type="tel" name="contato2" value={formData.contato2} onChange={onChange}
          maxLength={15} className={INPUT_CLS} placeholder="(00) 00000-0000" />
      </div>
    </div>

    <div>
      <label className={LABEL_CLS}><FileText size={12} className="inline mr-1" />Observações Internas (Opcional)</label>
      <textarea name="observacao" value={formData.observacao} onChange={onChange} rows={3}
        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-violet-400 focus:bg-white outline-none transition-all resize-none" placeholder="Anotações internas da secretaria..." />
    </div>
  </div>
);

export default ParceiroAlunoFormStepContact;

import type React from 'react';
import { AlertCircle, Heart, Shield } from 'lucide-react';

import { INPUT_CLS, LABEL_CLS, sectionHeaderCls } from './parceiro-aluno-form.constants';
import type { AlunoFormStepProps } from './parceiro-aluno-form.types';

interface FamilyStepProps extends AlunoFormStepProps {
  isMinor: boolean;
}

const ParceiroAlunoFormStepFamily: React.FC<FamilyStepProps> = ({ formData, isMinor, onChange }) => (
  <div className="space-y-5 ">
    <div className={sectionHeaderCls('rose')}>
      <Heart size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Filiação</h4>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div>
        <label className={LABEL_CLS}>Nome da Mãe <span className="text-red-500">*</span></label>
        <input type="text" name="nomeMae" value={formData.nomeMae} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome completo da mãe" />
      </div>

      <div>
        <label className={LABEL_CLS}>Nome do Pai</label>
        <input type="text" name="nomePai" value={formData.nomePai} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome completo do pai (opcional)" />
      </div>
    </div>

    {isMinor ? (
      <div className="mt-2">
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 flex items-start gap-3 mb-5">
          <AlertCircle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-700 font-bold">
            Aluno menor de idade — Dados do responsável legal são obrigatórios.
          </p>
        </div>

        <div className={sectionHeaderCls('rose')}>
          <Shield size={16} />
          <h4 className="text-xs font-black uppercase tracking-wider">Responsável Legal</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Nome do Responsável <span className="text-red-500">*</span></label>
            <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={onChange}
              className={INPUT_CLS} placeholder="Nome completo do responsável" />
          </div>

          <div>
            <label className={LABEL_CLS}>CPF do Responsável <span className="text-red-500">*</span></label>
            <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={onChange}
              maxLength={14} className={`${INPUT_CLS} font-mono`} placeholder="000.000.000-00" />
          </div>

          <div>
            <label className={LABEL_CLS}>Parentesco <span className="text-red-500">*</span></label>
            <select name="responsavelParentesco" value={formData.responsavelParentesco} onChange={onChange} className={INPUT_CLS}>
              <option value="">Selecione...</option>
              <option value="MÃE">MÃE</option>
              <option value="PAI">PAI</option>
              <option value="AVÓ/AVÔ">AVÓ/AVÔ</option>
              <option value="TIO(A)">TIO(A)</option>
              <option value="IRMÃO/IRMÃ">IRMÃO/IRMÃ</option>
              <option value="TUTOR(A) LEGAL">TUTOR(A) LEGAL</option>
              <option value="OUTRO">OUTRO</option>
            </select>
          </div>

          <div>
            <label className={LABEL_CLS}>Telefone do Responsável <span className="text-red-500">*</span></label>
            <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={onChange}
              maxLength={15} className={INPUT_CLS} placeholder="(00) 00000-0000" />
          </div>
        </div>
      </div>
    ) : (
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
        <p className="text-xs text-slate-500 font-medium text-center">
          Responsável legal não obrigatório para alunos maiores de 18 anos.
          <br />Caso deseje cadastrar mesmo assim, informe abaixo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
          <div className="md:col-span-2">
            <label className={LABEL_CLS}>Nome do Responsável (Opcional)</label>
            <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={onChange}
              className={INPUT_CLS} placeholder="Nome completo" />
          </div>
          <div>
            <label className={LABEL_CLS}>CPF do Responsável</label>
            <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={onChange}
              maxLength={14} className={`${INPUT_CLS} font-mono`} placeholder="000.000.000-00" />
          </div>
          <div>
            <label className={LABEL_CLS}>Parentesco</label>
            <select name="responsavelParentesco" value={formData.responsavelParentesco} onChange={onChange} className={INPUT_CLS}>
              <option value="">Selecione...</option>
              <option value="CÔNJUGE">CÔNJUGE</option>
              <option value="MÃE">MÃE</option>
              <option value="PAI">PAI</option>
              <option value="OUTRO">OUTRO</option>
            </select>
          </div>
        </div>
      </div>
    )}

    <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-5">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="responsavelFinanceiro"
          checked={formData.responsavelFinanceiro}
          onChange={onChange}
          className="mt-0.5 h-4 w-4 accent-blue-600"
        />
        <span>
          <strong className="block text-xs uppercase tracking-wider text-blue-800">Responsável financeiro obrigatório</strong>
          <span className="mt-1 block text-xs text-blue-700">Marque para declarar que este responsável ou o próprio aluno assumirá as cobranças da matrícula técnica.</span>
        </span>
      </label>
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
        {!isMinor && (
          <div>
            <label className={LABEL_CLS}>Telefone do Responsável</label>
            <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={onChange}
              maxLength={15} className={INPUT_CLS} placeholder="(00) 00000-0000" />
          </div>
        )}
        <div>
          <label className={LABEL_CLS}>E-mail do Responsável</label>
          <input type="email" name="responsavelEmail" value={formData.responsavelEmail} onChange={onChange}
            className={INPUT_CLS} placeholder="responsavel@email.com" />
        </div>
      </div>
    </div>
  </div>
);

export default ParceiroAlunoFormStepFamily;

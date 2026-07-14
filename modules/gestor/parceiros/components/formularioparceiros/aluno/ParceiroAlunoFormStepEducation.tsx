import type React from 'react';
import { GraduationCap } from 'lucide-react';

import { ESCOLARIDADES, INPUT_CLS, LABEL_CLS, sectionHeaderCls } from './parceiro-aluno-form.constants';
import type { AlunoFormStepProps } from './parceiro-aluno-form.types';

const ParceiroAlunoFormStepEducation: React.FC<AlunoFormStepProps> = ({ formData, onChange }) => (
  <div className="space-y-5 animate-fadeIn">
    <div className={sectionHeaderCls('emerald')}>
      <GraduationCap size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Formação Acadêmica Anterior</h4>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Nível de Escolaridade Anterior <span className="text-red-500">*</span></label>
        <select name="escolaridadeAnterior" value={formData.escolaridadeAnterior} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione a escolaridade...</option>
          {ESCOLARIDADES.map((escolaridade) => <option key={escolaridade} value={escolaridade}>{escolaridade}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Instituição de Ensino Anterior</label>
        <input type="text" name="instituicaoOrigem" value={formData.instituicaoOrigem} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome da escola/faculdade" />
      </div>

      <div>
        <label className={LABEL_CLS}>Ano de Conclusão do Ensino Médio</label>
        <input type="text" name="anoConclusaoEnsinoMedio" value={formData.anoConclusaoEnsinoMedio} onChange={onChange}
          maxLength={4} className={INPUT_CLS} placeholder="Ex: 2019" />
      </div>
    </div>

    <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
      <p className="text-xs text-emerald-700 font-medium leading-relaxed">
        <strong>Cursos Técnicos:</strong> O Ensino Médio completo é requisito mínimo obrigatório para inscrição em cursos técnicos subsequentes. O comprovante será verificado no momento da entrega de documentos.
      </p>
    </div>
  </div>
);

export default ParceiroAlunoFormStepEducation;

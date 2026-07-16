import type React from 'react';
import { GraduationCap } from 'lucide-react';

import { ESCOLARIDADES, INPUT_CLS, LABEL_CLS, sectionHeaderCls } from './parceiro-aluno-form.constants';
import type { AlunoFormStepProps } from './parceiro-aluno-form.types';

const ParceiroAlunoFormStepEducation: React.FC<AlunoFormStepProps> = ({ formData, onChange }) => (
  <div className="space-y-5 ">
    <div className={sectionHeaderCls('emerald')}>
      <GraduationCap size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Dados do Ensino Médio</h4>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Situação do Ensino Médio <span className="text-red-500">*</span></label>
        <select name="situacaoEnsinoMedio" value={formData.situacaoEnsinoMedio} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione...</option>
          <option value="CURSANDO">Cursando</option>
          <option value="CONCLUIDO">Concluído</option>
        </select>
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>
          {formData.situacaoEnsinoMedio === 'CONCLUIDO' ? 'Escola onde concluiu' : 'Escola onde estuda'} <span className="text-red-500">*</span>
        </label>
        <input type="text" name="escolaEnsinoMedio" value={formData.escolaEnsinoMedio} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome completo da escola" />
      </div>

      {formData.situacaoEnsinoMedio === 'CURSANDO' ? (
        <>
          <div>
            <label className={LABEL_CLS}>Série atual <span className="text-red-500">*</span></label>
            <select name="serieEnsinoMedioAtual" value={formData.serieEnsinoMedioAtual} onChange={onChange} className={INPUT_CLS}>
              <option value="">Selecione...</option>
              <option value="2">2º ano</option>
              <option value="3">3º ano</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Previsão de conclusão <span className="text-red-500">*</span></label>
            <input type="text" inputMode="numeric" name="anoPrevisaoConclusaoEnsinoMedio"
              value={formData.anoPrevisaoConclusaoEnsinoMedio} onChange={onChange}
              maxLength={4} className={INPUT_CLS} placeholder="Ex: 2027" />
          </div>
        </>
      ) : null}

      {formData.situacaoEnsinoMedio === 'CONCLUIDO' ? (
        <div>
          <label className={LABEL_CLS}>Ano de conclusão <span className="text-red-500">*</span></label>
          <input type="text" inputMode="numeric" name="anoConclusaoEnsinoMedio"
            value={formData.anoConclusaoEnsinoMedio} onChange={onChange}
            maxLength={4} className={INPUT_CLS} placeholder="Ex: 2024" />
        </div>
      ) : null}
    </div>

    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
      <p className="text-xs font-medium leading-relaxed text-emerald-700">
        Estes dados determinam a elegibilidade para ingresso técnico concomitante ou subsequente.
      </p>
    </div>

    <div className="border-t border-slate-100 pt-5">
      <p className="mb-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Formação acadêmica complementar</p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className={LABEL_CLS}>Nível de escolaridade anterior</label>
          <select name="escolaridadeAnterior" value={formData.escolaridadeAnterior} onChange={onChange} className={INPUT_CLS}>
            <option value="">Selecione a escolaridade...</option>
            {ESCOLARIDADES.map((escolaridade) => <option key={escolaridade} value={escolaridade}>{escolaridade}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Instituição de ensino anterior</label>
          <input type="text" name="instituicaoOrigem" value={formData.instituicaoOrigem} onChange={onChange}
            className={INPUT_CLS} placeholder="Nome da escola/faculdade" />
        </div>
      </div>
    </div>
  </div>
);

export default ParceiroAlunoFormStepEducation;

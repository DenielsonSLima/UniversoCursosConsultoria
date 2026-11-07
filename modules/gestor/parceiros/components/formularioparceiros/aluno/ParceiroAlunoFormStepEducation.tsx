import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import { partnerSelectChange } from '../partner-select-change';
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

    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-xs font-medium leading-relaxed text-emerald-800">
      Esta etapa é opcional e não bloqueia a matrícula. Use EJA quando essa for a modalidade de formação do aluno.
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Situação do Ensino Médio</label>
        <InstitutionalSelect value={formData.situacaoEnsinoMedio} onValueChange={partnerSelectChange("situacaoEnsinoMedio", onChange)}
          ariaLabel="Situação do Ensino Médio" 
          options={[{ value: "", label: "Selecione..." },
            { value: "CURSANDO", label: "Cursando" },
            { value: "CONCLUIDO", label: "Concluído" },
            { value: "EJA", label: "EJA" }]} className="w-full" />
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>
          {formData.situacaoEnsinoMedio === 'CONCLUIDO' ? 'Escola onde concluiu' : 'Escola onde estuda'}
        </label>
        <input type="text" name="escolaEnsinoMedio" value={formData.escolaEnsinoMedio} onChange={onChange}
          className={INPUT_CLS} placeholder="Nome completo da escola" />
      </div>

      {formData.situacaoEnsinoMedio === 'CURSANDO' ? (
        <>
          <div>
            <label className={LABEL_CLS}>Série atual</label>
            <InstitutionalSelect value={formData.serieEnsinoMedioAtual} onValueChange={partnerSelectChange("serieEnsinoMedioAtual", onChange)}
              ariaLabel="Série atual do Ensino Médio" 
              options={[{ value: "", label: "Selecione..." },
                { value: "2", label: "2º ano" },
                { value: "3", label: "3º ano" }]} className="w-full" />
          </div>
          <div>
            <label className={LABEL_CLS}>Previsão de conclusão</label>
            <input type="text" inputMode="numeric" name="anoPrevisaoConclusaoEnsinoMedio"
              value={formData.anoPrevisaoConclusaoEnsinoMedio} onChange={onChange}
              maxLength={4} className={INPUT_CLS} placeholder="Ex: 2027" />
          </div>
        </>
      ) : null}

      {formData.situacaoEnsinoMedio === 'CONCLUIDO' ? (
        <div>
          <label className={LABEL_CLS}>Ano de conclusão</label>
          <input type="text" inputMode="numeric" name="anoConclusaoEnsinoMedio"
            value={formData.anoConclusaoEnsinoMedio} onChange={onChange}
            maxLength={4} className={INPUT_CLS} placeholder="Ex: 2024" />
        </div>
      ) : null}
    </div>

    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
      <p className="text-xs font-medium leading-relaxed text-emerald-700">
        Estes dados são informativos e podem ser completados ou atualizados posteriormente.
      </p>
    </div>

    <div className="border-t border-slate-100 pt-5">
      <p className="mb-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Formação acadêmica complementar</p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div>
          <label className={LABEL_CLS}>Nível de escolaridade anterior</label>
          <InstitutionalSelect value={formData.escolaridadeAnterior} onValueChange={partnerSelectChange("escolaridadeAnterior", onChange)}
            ariaLabel="Escolaridade anterior" 
            options={[{ value: "", label: "Selecione a escolaridade..." },
              ...ESCOLARIDADES.map((escolaridade) => ({ value: escolaridade, label: escolaridade }))]} className="w-full" />
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

import type React from 'react';

import { formatCpf } from '../../../../../../lib/documentFormatters';
import { TECHNICAL_DOCUMENT_TYPE_OPTIONS } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import { ESCOLARIDADES, UFS } from '../../formularioparceiros/aluno/parceiro-aluno-form.constants';
import {
  CERTIDAO_CIVIL_MODEL_OPTIONS,
  CERTIDAO_CIVIL_TYPE_OPTIONS,
} from '../../../utils/parceiros.constants';
import ParceiroAlunoDisplayField from './ParceiroAlunoDisplayField';
import { formatDocumentTypeLabel, formatPhoneDisplay } from './parceiro-aluno-dados.utils';

interface DetailsSectionsProps {
  formData: any;
  isEditing: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
}

const ParceiroAlunoFamilySection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => (
  <div className="space-y-6 pt-6">
    <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Filiação</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome da Mãe</label>
            <input type="text" name="nomeMae" value={formData.nomeMae || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome do Pai</label>
            <input type="text" name="nomePai" value={formData.nomePai || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Nome da Mãe" value={formData.nomeMae} />
          <ParceiroAlunoDisplayField label="Nome do Pai" value={formData.nomePai} />
        </>
      )}
    </div>
  </div>
);

const ParceiroAlunoGuardianSection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => (
  <div className="space-y-6 pt-6">
    <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Responsável legal e financeiro</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEditing ? (
        <>
          <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 cursor-pointer">
            <input type="checkbox" name="responsavelFinanceiro" checked={!!formData.responsavelFinanceiro} onChange={onChange} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>
              <strong className="block text-xs uppercase tracking-wider text-blue-800">Responsável pelos pagamentos</strong>
              <span className="mt-1 block text-xs text-blue-700">Será considerado como pagador na declaração de IRPF.</span>
            </span>
          </label>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome</label>
            <input name="responsavelNome" value={formData.responsavelNome || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
            <input name="responsavelCpf" value={formData.responsavelCpf || ''} onChange={onChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Parentesco</label>
            <input name="responsavelParentesco" value={formData.responsavelParentesco || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone</label>
            <input type="tel" name="responsavelTelefone" value={formData.responsavelTelefone || ''} onChange={onChange} maxLength={15} inputMode="tel" placeholder="(00) 00000-0000" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
            <input type="email" name="responsavelEmail" value={formData.responsavelEmail || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Responsável" value={formData.responsavelNome} />
          <ParceiroAlunoDisplayField label="CPF" value={formatCpf(formData.responsavelCpf)} />
          <ParceiroAlunoDisplayField label="Parentesco" value={formData.responsavelParentesco} />
          <ParceiroAlunoDisplayField label="Telefone" value={formatPhoneDisplay(formData.responsavelTelefone)} />
          <ParceiroAlunoDisplayField label="E-mail" value={formData.responsavelEmail} />
          <ParceiroAlunoDisplayField label="Responsável financeiro" value={formData.responsavelFinanceiro ? 'SIM' : 'NÃO'} />
        </>
      )}
    </div>
  </div>
);

const ParceiroAlunoDocumentsSection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => (
  <div className="space-y-6 pt-6">
    <h4 className="text-sm font-bold text-[#001a33] uppercase tracking-wide border-b border-slate-100 pb-2">Documentação Civil</h4>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Tipo de documento</label>
            <select name="tipoDocumento" value={formData.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
              {TECHNICAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Número do documento</label>
            <input type="text" name="rg" value={formData.rg || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Órgão Emissor / UF</label>
            <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Título de Eleitor</label>
            <input type="text" inputMode="numeric" name="tituloEleitor" value={formData.tituloEleitor || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Zona Eleitoral</label>
            <input type="text" inputMode="numeric" maxLength={4} name="tituloEleitorZona" value={formData.tituloEleitorZona || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Seção Eleitoral</label>
            <input type="text" inputMode="numeric" maxLength={4} name="tituloEleitorSecao" value={formData.tituloEleitorSecao || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Emissão do Título</label>
            <input type="text" inputMode="numeric" maxLength={10} name="tituloEleitorDataEmissao" value={formData.tituloEleitorDataEmissao || ''} onChange={onChange} placeholder="DD/MM/AAAA" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">UF do Título</label>
            <select name="tituloEleitorUf" value={formData.tituloEleitorUf || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
              <option value="">UF</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nacionalidade</label>
            <input type="text" name="nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Naturalidade</label>
            <input type="text" name="naturalidade" value={formData.naturalidade || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Reservista</label>
            <input type="text" name="reservista" value={formData.reservista || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
          </div>
          <div className="md:col-span-3 border-t border-slate-100 pt-4">
            <h5 className="text-xs font-black uppercase tracking-wider text-blue-700">Certidão Civil</h5>
            <p className="mt-1 text-[10px] font-medium text-slate-400">Nascimento ou casamento, no modelo antigo ou novo.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Tipo de certidão</label>
            <select name="certidaoTipo" value={formData.certidaoTipo || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
              <option value="">Selecione...</option>
              {CERTIDAO_CIVIL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase ml-1">Modelo da certidão</label>
            <select name="certidaoModelo" value={formData.certidaoModelo || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none">
              <option value="">Selecione...</option>
              {CERTIDAO_CIVIL_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {formData.certidaoModelo === 'NOVO' ? (
            <div className="md:col-span-3 space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">Matrícula da certidão</label>
              <input type="text" inputMode="numeric" maxLength={32} name="certidaoMatricula" value={formData.certidaoMatricula || ''} onChange={onChange}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono tracking-wider focus:border-blue-500 outline-none" placeholder="32 dígitos" />
            </div>
          ) : null}
          {formData.certidaoModelo === 'ANTIGO' ? (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Livro</label>
                <input type="text" name="certidaoLivro" value={formData.certidaoLivro || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Folha</label>
                <input type="text" name="certidaoFolha" value={formData.certidaoFolha || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Termo</label>
                <input type="text" name="certidaoTermo" value={formData.certidaoTermo || ''} onChange={onChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none" />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Tipo de documento" value={formatDocumentTypeLabel(formData.tipoDocumento)} />
          <ParceiroAlunoDisplayField label="Número do documento" value={formData.rg} />
          <ParceiroAlunoDisplayField label="Órgão Emissor / UF" value={formData.orgaoEmissor} />
          <ParceiroAlunoDisplayField label="Título de Eleitor" value={formData.tituloEleitor} />
          <ParceiroAlunoDisplayField label="Zona Eleitoral" value={formData.tituloEleitorZona} />
          <ParceiroAlunoDisplayField label="Seção Eleitoral" value={formData.tituloEleitorSecao} />
          <ParceiroAlunoDisplayField label="Emissão do Título" value={formData.tituloEleitorDataEmissao} />
          <ParceiroAlunoDisplayField label="UF do Título" value={formData.tituloEleitorUf} />
          <ParceiroAlunoDisplayField label="Nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} />
          <ParceiroAlunoDisplayField label="Naturalidade" value={formData.naturalidade} />
          <ParceiroAlunoDisplayField label="Reservista" value={formData.reservista} />
          <ParceiroAlunoDisplayField
            label="Tipo de certidão"
            value={CERTIDAO_CIVIL_TYPE_OPTIONS.find((option) => option.value === formData.certidaoTipo)?.label}
          />
          <ParceiroAlunoDisplayField
            label="Modelo da certidão"
            value={CERTIDAO_CIVIL_MODEL_OPTIONS.find((option) => option.value === formData.certidaoModelo)?.label}
          />
          {formData.certidaoModelo === 'NOVO' ? (
            <div className="md:col-span-3">
              <ParceiroAlunoDisplayField label="Matrícula da certidão" value={formData.certidaoMatricula} />
            </div>
          ) : null}
          {formData.certidaoModelo === 'ANTIGO' ? (
            <>
              <ParceiroAlunoDisplayField label="Livro" value={formData.certidaoLivro} />
              <ParceiroAlunoDisplayField label="Folha" value={formData.certidaoFolha} />
              <ParceiroAlunoDisplayField label="Termo" value={formData.certidaoTermo} />
            </>
          ) : null}
        </>
      )}
    </div>
  </div>
);

const ParceiroAlunoEducationSection: React.FC<DetailsSectionsProps> = ({ formData, isEditing, onChange }) => {
  const isStudying = formData.situacaoEnsinoMedio === 'CURSANDO';
  const isCompleted = formData.situacaoEnsinoMedio === 'CONCLUIDO';
  const inputClassName = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none';
  const labelClassName = 'text-xs font-bold text-slate-500 uppercase ml-1';

  return (
    <div className="space-y-6 pt-6">
      <div className="border-b border-slate-100 pb-2">
        <h4 className="text-sm font-bold uppercase tracking-wide text-[#001a33]">Ensino Médio</h4>
        <p className="mt-1 text-[10px] font-semibold text-slate-400">Dados obrigatórios para matrícula em cursos técnicos.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isEditing ? (
          <>
            <div className="space-y-2">
              <label className={labelClassName}>Situação do Ensino Médio</label>
              <select name="situacaoEnsinoMedio" value={formData.situacaoEnsinoMedio || ''} onChange={onChange} className={inputClassName}>
                <option value="">Selecione...</option>
                <option value="CURSANDO">CURSANDO</option>
                <option value="CONCLUIDO">CONCLUÍDO</option>
              </select>
            </div>
            {isStudying ? (
              <div className="space-y-2">
                <label className={labelClassName}>Série atual</label>
                <select name="serieEnsinoMedioAtual" value={formData.serieEnsinoMedioAtual || ''} onChange={onChange} className={inputClassName}>
                  <option value="">Selecione...</option>
                  <option value="2">2º ANO</option>
                  <option value="3">3º ANO</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-2 md:col-span-2">
              <label className={labelClassName}>{isCompleted ? 'Escola onde concluiu' : 'Escola onde estuda'}</label>
              <input type="text" name="escolaEnsinoMedio" value={formData.escolaEnsinoMedio || ''} onChange={onChange}
                className={inputClassName} placeholder="Nome completo da escola" />
            </div>
            {isStudying ? (
              <div className="space-y-2">
                <label className={labelClassName}>Previsão de conclusão</label>
                <input type="text" inputMode="numeric" maxLength={4} name="anoPrevisaoConclusaoEnsinoMedio"
                  value={formData.anoPrevisaoConclusaoEnsinoMedio || ''} onChange={onChange}
                  className={inputClassName} placeholder="Ex.: 2027" />
              </div>
            ) : null}
            {isCompleted ? (
              <div className="space-y-2">
                <label className={labelClassName}>Ano de conclusão</label>
                <input type="text" inputMode="numeric" maxLength={4} name="anoConclusaoEnsinoMedio"
                  value={formData.anoConclusaoEnsinoMedio || ''} onChange={onChange}
                  className={inputClassName} placeholder="Ex.: 2024" />
              </div>
            ) : null}
            <div className="space-y-2">
              <label className={labelClassName}>Escolaridade anterior</label>
              <select name="escolaridadeAnterior" value={formData.escolaridadeAnterior || ''} onChange={onChange} className={inputClassName}>
                <option value="">Selecione...</option>
                {ESCOLARIDADES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className={labelClassName}>Instituição de origem</label>
              <input type="text" name="instituicaoOrigem" value={formData.instituicaoOrigem || ''} onChange={onChange}
                className={inputClassName} placeholder="Escola ou instituição anterior" />
            </div>
          </>
        ) : (
          <>
            <ParceiroAlunoDisplayField label="Situação do Ensino Médio" value={isCompleted ? 'CONCLUÍDO' : formData.situacaoEnsinoMedio} />
            {isStudying ? <ParceiroAlunoDisplayField label="Série atual" value={formData.serieEnsinoMedioAtual ? `${formData.serieEnsinoMedioAtual}º ANO` : ''} /> : null}
            <ParceiroAlunoDisplayField label={isCompleted ? 'Escola onde concluiu' : 'Escola onde estuda'} value={formData.escolaEnsinoMedio} />
            {isStudying ? <ParceiroAlunoDisplayField label="Previsão de conclusão" value={formData.anoPrevisaoConclusaoEnsinoMedio} /> : null}
            {isCompleted ? <ParceiroAlunoDisplayField label="Ano de conclusão" value={formData.anoConclusaoEnsinoMedio} /> : null}
            <ParceiroAlunoDisplayField label="Escolaridade anterior" value={formData.escolaridadeAnterior} />
            <ParceiroAlunoDisplayField label="Instituição de origem" value={formData.instituicaoOrigem} />
          </>
        )}
      </div>
    </div>
  );
};

const ParceiroAlunoDetailsSections: React.FC<DetailsSectionsProps> = (props) => (
  <>
    <ParceiroAlunoFamilySection {...props} />
    <ParceiroAlunoGuardianSection {...props} />
    <ParceiroAlunoDocumentsSection {...props} />
    <ParceiroAlunoEducationSection {...props} />
  </>
);

export default ParceiroAlunoDetailsSections;

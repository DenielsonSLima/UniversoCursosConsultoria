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
  <div id="aluno-filiacao" className="scroll-mt-28 space-y-4 border-t border-slate-100 pt-6">
    <h4 className="text-base font-semibold text-[#001a33] border-b border-slate-100 pb-3">Filiação</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="aluno-nomeMae" className="block text-xs font-medium text-slate-600">Nome da Mãe</label>
            <input id="aluno-nomeMae" type="text" name="nomeMae" value={formData.nomeMae || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-nomePai" className="block text-xs font-medium text-slate-600">Nome do Pai</label>
            <input id="aluno-nomePai" type="text" name="nomePai" value={formData.nomePai || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
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
  <div id="aluno-responsavel" className="scroll-mt-28 space-y-4 border-t border-slate-100 pt-6">
    <h4 className="text-base font-semibold text-[#001a33] border-b border-slate-100 pb-3">Responsável legal e financeiro</h4>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEditing ? (
        <>
          <label className="md:col-span-2 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 p-4 cursor-pointer">
            <input type="checkbox" name="responsavelFinanceiro" checked={!!formData.responsavelFinanceiro} onChange={onChange} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span>
              <strong className="block text-sm font-medium text-blue-800">Responsável pelos pagamentos</strong>
              <span className="mt-1 block text-xs text-blue-700">Será considerado como pagador na declaração de IRPF.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <label htmlFor="aluno-responsavelNome" className="block text-xs font-medium text-slate-600">Nome</label>
            <input id="aluno-responsavelNome" name="responsavelNome" value={formData.responsavelNome || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-responsavelCpf" className="block text-xs font-medium text-slate-600">CPF</label>
            <input id="aluno-responsavelCpf" name="responsavelCpf" value={formData.responsavelCpf || ''} onChange={onChange} maxLength={14} inputMode="numeric" placeholder="000.000.000-00" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-responsavelParentesco" className="block text-xs font-medium text-slate-600">Parentesco</label>
            <input id="aluno-responsavelParentesco" name="responsavelParentesco" value={formData.responsavelParentesco || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-responsavelTelefone" className="block text-xs font-medium text-slate-600">Telefone</label>
            <input id="aluno-responsavelTelefone" type="tel" name="responsavelTelefone" value={formData.responsavelTelefone || ''} onChange={onChange} maxLength={15} inputMode="tel" placeholder="(00) 00000-0000" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="aluno-responsavelEmail" className="block text-xs font-medium text-slate-600">E-mail</label>
            <input id="aluno-responsavelEmail" type="email" name="responsavelEmail" value={formData.responsavelEmail || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
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
  <div id="aluno-documentacao" className="scroll-mt-28 space-y-4 border-t border-slate-100 pt-6">
    <h4 className="text-base font-semibold text-[#001a33] border-b border-slate-100 pb-3">Documentação Civil</h4>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {isEditing ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="aluno-tipoDocumento" className="block text-xs font-medium text-slate-600">Tipo de documento</label>
            <select id="aluno-tipoDocumento" name="tipoDocumento" value={formData.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO'} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
              {TECHNICAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-rg" className="block text-xs font-medium text-slate-600">Número do documento</label>
            <input id="aluno-rg" type="text" name="rg" value={formData.rg || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-orgaoEmissor" className="block text-xs font-medium text-slate-600">Órgão expedidor</label>
            <input id="aluno-orgaoEmissor" type="text" name="orgaoEmissor" value={formData.orgaoEmissor || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-rgUfEmissao" className="block text-xs font-medium text-slate-600">UF de expedição</label>
            <select id="aluno-rgUfEmissao" name="rgUfEmissao" value={formData.rgUfEmissao || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
              <option value="">Selecione...</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-rgDataEmissao" className="block text-xs font-medium text-slate-600">Data de expedição</label>
            <input id="aluno-rgDataEmissao" type="text" inputMode="numeric" maxLength={10} name="rgDataEmissao" value={formData.rgDataEmissao || ''} onChange={onChange} placeholder="DD/MM/AAAA" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="md:col-span-3 border-t border-slate-100 pt-4 text-sm font-medium text-slate-700">Dados eleitorais e origem</div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-tituloEleitor" className="block text-xs font-medium text-slate-600">Título de Eleitor</label>
            <input id="aluno-tituloEleitor" type="text" inputMode="numeric" name="tituloEleitor" value={formData.tituloEleitor || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-tituloEleitorZona" className="block text-xs font-medium text-slate-600">Zona Eleitoral</label>
            <input id="aluno-tituloEleitorZona" type="text" inputMode="numeric" maxLength={4} name="tituloEleitorZona" value={formData.tituloEleitorZona || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-tituloEleitorSecao" className="block text-xs font-medium text-slate-600">Seção Eleitoral</label>
            <input id="aluno-tituloEleitorSecao" type="text" inputMode="numeric" maxLength={4} name="tituloEleitorSecao" value={formData.tituloEleitorSecao || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-tituloEleitorDataEmissao" className="block text-xs font-medium text-slate-600">Emissão do Título</label>
            <input id="aluno-tituloEleitorDataEmissao" type="text" inputMode="numeric" maxLength={10} name="tituloEleitorDataEmissao" value={formData.tituloEleitorDataEmissao || ''} onChange={onChange} placeholder="DD/MM/AAAA" className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-tituloEleitorUf" className="block text-xs font-medium text-slate-600">UF do Título</label>
            <select id="aluno-tituloEleitorUf" name="tituloEleitorUf" value={formData.tituloEleitorUf || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
              <option value="">UF</option>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-nacionalidade" className="block text-xs font-medium text-slate-600">Nacionalidade</label>
            <input id="aluno-nacionalidade" type="text" name="nacionalidade" value={formData.nacionalidade || 'BRASILEIRA'} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-naturalidade" className="block text-xs font-medium text-slate-600">Naturalidade</label>
            <input id="aluno-naturalidade" type="text" name="naturalidade" value={formData.naturalidade || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-reservista" className="block text-xs font-medium text-slate-600">Reservista</label>
            <input id="aluno-reservista" type="text" name="reservista" value={formData.reservista || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div className="md:col-span-3 border-t border-slate-100 pt-4">
            <h5 className="text-sm font-medium text-slate-700">Certidão Civil</h5>
            <p className="mt-1 text-xs text-slate-500">Nascimento ou casamento, no modelo antigo ou novo.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="aluno-certidaoTipo" className="block text-xs font-medium text-slate-600">Tipo de certidão</label>
            <select id="aluno-certidaoTipo" name="certidaoTipo" value={formData.certidaoTipo || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
              <option value="">Selecione...</option>
              {CERTIDAO_CIVIL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="aluno-certidaoModelo" className="block text-xs font-medium text-slate-600">Modelo da certidão</label>
            <select id="aluno-certidaoModelo" name="certidaoModelo" value={formData.certidaoModelo || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none">
              <option value="">Selecione...</option>
              {CERTIDAO_CIVIL_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {formData.certidaoModelo === 'NOVO' ? (
            <div className="md:col-span-3 space-y-1.5">
              <label htmlFor="aluno-certidaoMatricula" className="block text-xs font-medium text-slate-600">Matrícula da certidão</label>
              <input id="aluno-certidaoMatricula" type="text" inputMode="numeric" maxLength={32} name="certidaoMatricula" value={formData.certidaoMatricula || ''} onChange={onChange}
                className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-xl font-mono tracking-wider focus:border-blue-500 outline-none" placeholder="32 dígitos" />
            </div>
          ) : null}
          {formData.certidaoModelo === 'ANTIGO' ? (
            <>
              <div className="space-y-1.5">
                <label htmlFor="aluno-certidaoLivro" className="block text-xs font-medium text-slate-600">Livro</label>
                <input id="aluno-certidaoLivro" type="text" name="certidaoLivro" value={formData.certidaoLivro || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="aluno-certidaoFolha" className="block text-xs font-medium text-slate-600">Folha</label>
                <input id="aluno-certidaoFolha" type="text" name="certidaoFolha" value={formData.certidaoFolha || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="aluno-certidaoTermo" className="block text-xs font-medium text-slate-600">Termo</label>
                <input id="aluno-certidaoTermo" type="text" name="certidaoTermo" value={formData.certidaoTermo || ''} onChange={onChange} className="w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          <ParceiroAlunoDisplayField label="Tipo de documento" value={formatDocumentTypeLabel(formData.tipoDocumento)} />
          <ParceiroAlunoDisplayField label="Número do documento" value={formData.rg} />
          <ParceiroAlunoDisplayField label="Órgão expedidor" value={formData.orgaoEmissor} />
          <ParceiroAlunoDisplayField label="UF de expedição" value={formData.rgUfEmissao} />
          <ParceiroAlunoDisplayField label="Data de expedição" value={formData.rgDataEmissao} />
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
  const inputClassName = 'w-full min-h-11 sm:min-h-10 px-3 py-2 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none';
  const labelClassName = 'block text-xs font-medium text-slate-600';

  return (
    <div id="aluno-escolaridade" className="scroll-mt-28 space-y-4 border-t border-slate-100 pt-6">
      <div className="border-b border-slate-100 pb-2">
        <h4 className="text-base font-semibold text-[#001a33]">Ensino Médio</h4>
        <p className="mt-1 text-xs text-slate-500">Dados obrigatórios para matrícula em cursos técnicos.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {isEditing ? (
          <>
            <div className="space-y-1.5">
              <label htmlFor="aluno-situacaoEnsinoMedio" className={labelClassName}>Situação do Ensino Médio</label>
              <select id="aluno-situacaoEnsinoMedio" name="situacaoEnsinoMedio" value={formData.situacaoEnsinoMedio || ''} onChange={onChange} className={inputClassName}>
                <option value="">Selecione...</option>
                <option value="CURSANDO">CURSANDO</option>
                <option value="CONCLUIDO">CONCLUÍDO</option>
              </select>
            </div>
            {isStudying ? (
              <div className="space-y-1.5">
                <label htmlFor="aluno-serieEnsinoMedioAtual" className={labelClassName}>Série atual</label>
                <select id="aluno-serieEnsinoMedioAtual" name="serieEnsinoMedioAtual" value={formData.serieEnsinoMedioAtual || ''} onChange={onChange} className={inputClassName}>
                  <option value="">Selecione...</option>
                  <option value="2">2º ANO</option>
                  <option value="3">3º ANO</option>
                </select>
              </div>
            ) : null}
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="aluno-escolaEnsinoMedio" className={labelClassName}>{isCompleted ? 'Escola onde concluiu' : 'Escola onde estuda'}</label>
              <input id="aluno-escolaEnsinoMedio" type="text" name="escolaEnsinoMedio" value={formData.escolaEnsinoMedio || ''} onChange={onChange}
                className={inputClassName} placeholder="Nome completo da escola" />
            </div>
            {isStudying ? (
              <div className="space-y-1.5">
                <label htmlFor="aluno-anoPrevisaoConclusaoEnsinoMedio" className={labelClassName}>Previsão de conclusão</label>
                <input id="aluno-anoPrevisaoConclusaoEnsinoMedio" type="text" inputMode="numeric" maxLength={4} name="anoPrevisaoConclusaoEnsinoMedio"
                  value={formData.anoPrevisaoConclusaoEnsinoMedio || ''} onChange={onChange}
                  className={inputClassName} placeholder="Ex.: 2027" />
              </div>
            ) : null}
            {isCompleted ? (
              <div className="space-y-1.5">
                <label htmlFor="aluno-anoConclusaoEnsinoMedio" className={labelClassName}>Ano de conclusão</label>
                <input id="aluno-anoConclusaoEnsinoMedio" type="text" inputMode="numeric" maxLength={4} name="anoConclusaoEnsinoMedio"
                  value={formData.anoConclusaoEnsinoMedio || ''} onChange={onChange}
                  className={inputClassName} placeholder="Ex.: 2024" />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="aluno-escolaridadeAnterior" className={labelClassName}>Escolaridade anterior</label>
              <select id="aluno-escolaridadeAnterior" name="escolaridadeAnterior" value={formData.escolaridadeAnterior || ''} onChange={onChange} className={inputClassName}>
                <option value="">Selecione...</option>
                {ESCOLARIDADES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="aluno-instituicaoOrigem" className={labelClassName}>Instituição de origem</label>
              <input id="aluno-instituicaoOrigem" type="text" name="instituicaoOrigem" value={formData.instituicaoOrigem || ''} onChange={onChange}
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

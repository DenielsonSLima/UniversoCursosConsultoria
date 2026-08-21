import type React from 'react';
import { AlertCircle, Shield } from 'lucide-react';

import { TECHNICAL_DOCUMENT_TYPE_OPTIONS } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import {
  CERTIDAO_CIVIL_MODEL_OPTIONS,
  CERTIDAO_CIVIL_TYPE_OPTIONS,
} from '../../../utils/parceiros.constants';
import { INPUT_CLS, LABEL_CLS, sectionHeaderCls, UFS } from './parceiro-aluno-form.constants';
import type { AlunoFormStepProps } from './parceiro-aluno-form.types';

const ParceiroAlunoFormStepDocuments: React.FC<AlunoFormStepProps> = ({ formData, onChange }) => (
  <div className="space-y-5 ">
    <div className={sectionHeaderCls('indigo')}>
      <Shield size={16} />
      <h4 className="text-xs font-black uppercase tracking-wider">Documentos de Identificação</h4>
    </div>

    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-xs font-medium leading-relaxed text-indigo-800">
      Esta etapa é opcional no cadastro inicial. Preencha agora somente se já tiver os dados; eles serão exigidos ao iniciar uma matrícula em curso técnico.
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div className="md:col-span-3">
        <label className={LABEL_CLS}>Tipo de Documento de Identificação</label>
        <select name="tipoDocumento" value={formData.tipoDocumento} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione se quiser informar agora</option>
          {TECHNICAL_DOCUMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Número do Documento</label>
        <input type="text" name="rg" value={formData.rg} onChange={onChange}
          className={INPUT_CLS} placeholder="Número do documento de identificação" />
      </div>

      <div>
        <label className={LABEL_CLS}>Órgão Emissor</label>
        <input type="text" name="orgaoEmissor" value={formData.orgaoEmissor} onChange={onChange}
          className={INPUT_CLS} placeholder="SSP, IFP, DETRAN..." />
      </div>

      <div>
        <label className={LABEL_CLS}>UF Emissão</label>
        <select name="rgUfEmissao" value={formData.rgUfEmissao} onChange={onChange} className={INPUT_CLS}>
          <option value="">UF</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>

      <div>
        <label className={LABEL_CLS}>Data de Emissão do Documento</label>
        <input type="text" name="rgDataEmissao" value={formData.rgDataEmissao} onChange={onChange}
          maxLength={10} className={INPUT_CLS} placeholder="DD/MM/AAAA" />
      </div>

      <div className="md:col-span-3"><div className="h-px bg-slate-100 my-1" /></div>

      <div className="md:col-span-3">
        <div className="mb-1">
          <h5 className="text-xs font-black uppercase tracking-wider text-indigo-700">Certidão Civil</h5>
          <p className="mt-1 text-[10px] font-medium text-slate-400">
            Opcional no cadastro inicial. Aceita certidão de nascimento ou casamento, tanto no modelo antigo quanto no novo.
          </p>
        </div>
      </div>

      <div>
        <label className={LABEL_CLS}>Tipo de Certidão</label>
        <select name="certidaoTipo" value={formData.certidaoTipo} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione se quiser informar agora</option>
          {CERTIDAO_CIVIL_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Modelo da Certidão</label>
        <select name="certidaoModelo" value={formData.certidaoModelo} onChange={onChange} className={INPUT_CLS}>
          <option value="">Selecione se quiser informar agora</option>
          {CERTIDAO_CIVIL_MODEL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {formData.certidaoModelo === 'NOVO' ? (
        <div className="md:col-span-3">
          <label className={LABEL_CLS}>Matrícula da Certidão</label>
          <input
            type="text"
            name="certidaoMatricula"
            value={formData.certidaoMatricula}
            onChange={onChange}
            inputMode="numeric"
            maxLength={32}
            className={`${INPUT_CLS} font-mono tracking-wider`}
            placeholder="Digite os 32 números"
          />
          <p className="mt-1 ml-0.5 text-[10px] text-slate-400">Use somente os 32 dígitos impressos no campo “Matrícula”.</p>
        </div>
      ) : null}

      {formData.certidaoModelo === 'ANTIGO' ? (
        <>
          <div>
            <label className={LABEL_CLS}>Livro</label>
            <input type="text" name="certidaoLivro" value={formData.certidaoLivro} onChange={onChange}
              className={INPUT_CLS} placeholder="Ex.: A-123" />
          </div>
          <div>
            <label className={LABEL_CLS}>Folha</label>
            <input type="text" name="certidaoFolha" value={formData.certidaoFolha} onChange={onChange}
              className={INPUT_CLS} placeholder="Número da folha" />
          </div>
          <div>
            <label className={LABEL_CLS}>Termo</label>
            <input type="text" name="certidaoTermo" value={formData.certidaoTermo} onChange={onChange}
              className={INPUT_CLS} placeholder="Número do termo" />
          </div>
        </>
      ) : null}

      <div className="md:col-span-3"><div className="h-px bg-slate-100 my-1" /></div>

      <div className="md:col-span-2">
        <label className={LABEL_CLS}>Título de Eleitor</label>
        <input type="text" name="tituloEleitor" value={formData.tituloEleitor} onChange={onChange}
          inputMode="numeric" className={INPUT_CLS} placeholder="Número do título" />
        <p className="text-[10px] text-slate-400 mt-1 ml-0.5">Obrigatório para maiores de 18 anos</p>
      </div>

      <div>
        <label className={LABEL_CLS}>Zona Eleitoral</label>
        <input type="text" name="tituloEleitorZona" value={formData.tituloEleitorZona} onChange={onChange}
          inputMode="numeric" maxLength={4} className={INPUT_CLS} placeholder="Zona" />
      </div>

      <div>
        <label className={LABEL_CLS}>Seção Eleitoral</label>
        <input type="text" name="tituloEleitorSecao" value={formData.tituloEleitorSecao} onChange={onChange}
          inputMode="numeric" maxLength={4} className={INPUT_CLS} placeholder="Seção" />
      </div>

      <div>
        <label className={LABEL_CLS}>Data de Emissão do Título</label>
        <input type="text" name="tituloEleitorDataEmissao" value={formData.tituloEleitorDataEmissao} onChange={onChange}
          inputMode="numeric" maxLength={10} className={INPUT_CLS} placeholder="DD/MM/AAAA" />
      </div>

      <div>
        <label className={LABEL_CLS}>UF do Título</label>
        <select name="tituloEleitorUf" value={formData.tituloEleitorUf} onChange={onChange} className={INPUT_CLS}>
          <option value="">UF</option>
          {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>

      <div className="md:col-span-3">
        <label className={LABEL_CLS}>Certificado de Reservista</label>
        <input type="text" name="reservista" value={formData.reservista} onChange={onChange}
          className={INPUT_CLS} placeholder="Nº do certificado (homens)" />
      </div>
    </div>

    <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 flex items-start gap-3">
      <AlertCircle size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
      <p className="text-xs text-indigo-700 font-medium leading-relaxed">
        Na matrícula em curso técnico, a identificação acadêmica deve ser feita com <strong>CIN</strong>, <strong>CNH</strong> ou <strong>RG</strong>. A certidão civil pode ser de <strong>nascimento</strong> ou <strong>casamento</strong>; documentos no modelo antigo permanecem aceitos. Os originais serão solicitados na conferência documental.
      </p>
    </div>
  </div>
);

export default ParceiroAlunoFormStepDocuments;

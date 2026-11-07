import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import { partnerSelectChange } from '../partner-select-change';
import React, { useEffect, useState } from 'react';
import { AlertCircle, Building, FileText, Loader2, MapPin, Plus, Search, Upload, User } from 'lucide-react';
import type { ParceiroPJFieldsProps, PoloOption } from './parceiro-pj-form.types';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const formatPoloLabel = (polo: PoloOption) => {
  const cidadeUf = [polo.cidade, polo.estado || polo.uf].filter(Boolean).join('/');
  return cidadeUf ? `${polo.nome} - ${cidadeUf}` : polo.nome;
};

const LogoPreview: React.FC<{ src?: string; alt: string }> = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return src && !failed ? (
    <img
      src={src}
      alt={alt}
      className="h-full w-full bg-white object-contain p-1"
      onError={() => setFailed(true)}
    />
  ) : (
    <Building className="text-slate-350" size={24} />
  );
};

const ParceiroPJFields: React.FC<ParceiroPJFieldsProps> = ({
  formData,
  setFormData,
  canAssociateAllPolos,
  poloScope,
  defaultPoloId,
  polos,
  inputCls,
  labelCls,
  sectionTitleCls,
  handleChange,
  handlePoloScopeChange,
  isSearchingCnpj,
  consultarCNPJ,
  cnpjError,
  isUploadingLogo,
  handleLogoUpload,
  categoriaId,
  setCategoriaId,
  categoriasQuery,
  setShowCategoriaForm,
  tipoParceriaId,
  setTipoParceriaId,
  tiposParceriaQuery,
  setShowTipoParceriaForm,
  handleCepBlur,
}) => (
  <>
    {/* ══════════════ SEÇÃO 1: DADOS DA EMPRESA ══════════════ */}
    <div className="partner-registration-section bg-white p-5 rounded-2xl border border-slate-150 shadow-sm">
      <div className={sectionTitleCls}>
        <Building size={16} />
        <span>Dados da Empresa / Entidade</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className={canAssociateAllPolos ? '' : 'md:col-span-2'}>
          <label className={labelCls}>CNPJ <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            <input
              type="text"
              name="cnpj"
              value={formData.cnpj}
              onChange={handleChange}
              maxLength={18}
              className={`${inputCls} font-mono flex-grow`}
              placeholder="00.000.000/0000-00"
              required
            />
            <button
              type="button"
              onClick={consultarCNPJ}
              disabled={isSearchingCnpj || formData.cnpj.replace(/\D/g, '').length !== 14}
              className="px-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold uppercase transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
              title="Consultar dados da empresa na Receita Federal"
            >
              {isSearchingCnpj ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Search size={14} />
              )}
              <span>Consultar</span>
            </button>
          </div>
          {cnpjError && (
            <p className="text-[11px] font-bold text-red-500 mt-1 ml-0.5 flex items-center gap-1 ">
              <AlertCircle size={10} />
              {cnpjError}
            </p>
          )}
        </div>

        {canAssociateAllPolos ? (
          <div>
            <label className={labelCls}>Escopo da Parceria</label>
            <InstitutionalSelect value={poloScope} onValueChange={partnerSelectChange("poloScope", handlePoloScopeChange)}
              ariaLabel="Escopo da parceria" 
              options={[{ value: "active", label: "Polo ativo no cabeçalho" },
                { value: "all", label: "Todos os polos" },
                ...polos
                .filter((polo) => polo.id !== defaultPoloId)
                .map((polo) => ({ value: polo.id, label: formatPoloLabel(polo) }))]} className="w-full" />
          </div>
        ) : null}

        <div className="md:col-span-2">
          <label className={labelCls}>Logo da Empresa / Parceira</label>
          <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="h-16 w-28 bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
              <LogoPreview src={formData.foto} alt={`Logo de ${formData.razaoSocial || 'parceiro'}`} />
            </div>
            <div className="flex-grow space-y-2">
              <label className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold uppercase cursor-pointer transition-colors border border-slate-200 shadow-sm">
                {isUploadingLogo ? (
                  <>
                    <Loader2 className="animate-spin text-slate-500" size={14} />
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>Upload da Logo</span>
                  </>
                )}
                <input 
                  type="file" 
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                  disabled={isUploadingLogo}
                />
              </label>
              {formData.foto && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, foto: '' }))}
                  className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-widest block mx-auto text-center"
                >
                  Remover Logo
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Razão Social <span className="text-red-500">*</span></label>
          <input type="text" name="razaoSocial" value={formData.razaoSocial} onChange={handleChange}
            className={inputCls} placeholder="Razão Social Completa" required />
        </div>

        <div>
          <label className={labelCls}>Nome Fantasia</label>
          <input type="text" name="nomeFantasia" value={formData.nomeFantasia} onChange={handleChange}
            className={inputCls} placeholder="Nome Fantasia" />
        </div>

        <div>
          <label className={labelCls}>Categoria da Empresa</label>
          <div className="flex items-stretch gap-2">
            <InstitutionalSelect value={categoriaId} onValueChange={(value) => setCategoriaId(value)}
              ariaLabel="Categoria da empresa" disabled={categoriasQuery.isLoading}
              options={[{ value: "", label: categoriasQuery.isLoading ? 'CARREGANDO CATEGORIAS...' : 'SEM CATEGORIA DEFINIDA' },
                ...(categoriasQuery.data || []).map((categoria) => ({ value: categoria.id, label: categoria.nome }))]} className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={() => setShowCategoriaForm(true)}
              className="flex w-14 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-white shadow-sm transition-colors hover:bg-blue-900"
              title="Cadastrar nova categoria"
              aria-label="Cadastrar nova categoria"
            >
              <Plus size={22} />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-slate-400">
            Segmento cadastral configurado em Configurações → Categorias de Cadastros.
          </p>
          {categoriasQuery.isError ? (
            <p className="mt-1.5 text-[10px] font-bold text-red-500">Não foi possível carregar as categorias.</p>
          ) : null}
        </div>

        <div>
          <label className={labelCls}>Tipo de Parceria / Convênio <span className="text-red-500">*</span></label>
          <div className="flex items-stretch gap-2">
            <InstitutionalSelect value={tipoParceriaId} onValueChange={(value) => setTipoParceriaId(value)}
              ariaLabel="Tipo de parceria ou convênio" disabled={tiposParceriaQuery.isLoading} required
              options={[{ value: "", label: tiposParceriaQuery.isLoading ? 'CARREGANDO TIPOS...' : 'SELECIONE O TIPO DE PARCERIA' },
                ...(tiposParceriaQuery.data || []).map((tipo) => ({ value: tipo.id, label: tipo.nome }))]} className="min-w-0 flex-1" />
            <button
              type="button"
              onClick={() => setShowTipoParceriaForm(true)}
              className="flex w-14 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-white shadow-sm transition-colors hover:bg-blue-900"
              title="Cadastrar novo tipo de parceria"
              aria-label="Cadastrar novo tipo de parceria"
            >
              <Plus size={22} />
            </button>
          </div>
          <p className="mt-1.5 text-[10px] font-medium text-slate-400">
            Opções administradas em Configurações → Tipos de Parceria.
          </p>
          {tiposParceriaQuery.isError ? (
            <p className="mt-1.5 text-[10px] font-bold text-red-500">Não foi possível carregar os tipos de parceria.</p>
          ) : null}
        </div>
      </div>
    </div>

    {/* ══════════════ SEÇÃO 2: ENDEREÇO & CONTATO GERAL ══════════════ */}
    <div className="partner-registration-section bg-white p-5 rounded-2xl border border-slate-150 shadow-sm">
      <div className={sectionTitleCls}>
        <MapPin size={16} />
        <span>Endereço e Contato Institucional</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div>
          <label className={labelCls}>CEP</label>
          <input type="text" name="cep" value={formData.cep} onChange={handleChange} onBlur={handleCepBlur}
            maxLength={9} className={inputCls} placeholder="00000-000" />
        </div>

        <div className="md:col-span-3">
          <label className={labelCls}>Logradouro</label>
          <input type="text" name="logradouro" value={formData.logradouro} onChange={handleChange}
            className={inputCls} placeholder="Rua / Avenida" />
        </div>

        <div>
          <label className={labelCls}>Número</label>
          <input type="text" name="numero" value={formData.numero} onChange={handleChange}
            className={inputCls} placeholder="123" />
        </div>

        <div>
          <label className={labelCls}>Complemento</label>
          <input type="text" name="complemento" value={formData.complemento} onChange={handleChange}
            className={inputCls} placeholder="Sala, Andar..." />
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Bairro</label>
          <input type="text" name="bairro" value={formData.bairro} onChange={handleChange}
            className={inputCls} placeholder="Bairro" />
        </div>

        <div className="md:col-span-3">
          <label className={labelCls}>Cidade</label>
          <input type="text" name="cidade" value={formData.cidade} onChange={handleChange}
            className={inputCls} placeholder="Nome da cidade" />
        </div>

        <div>
          <label className={labelCls}>UF</label>
          <InstitutionalSelect value={formData.uf} onValueChange={partnerSelectChange("uf", handleChange)}
            ariaLabel="UF" 
            options={[{ value: "", label: "UF" },
              ...UFS.map(u => ({ value: u, label: u }))]} className="w-full" />
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>E-mail Geral / Institucional</label>
          <input type="email" name="email" value={formData.email} onChange={handleChange}
            className={inputCls} placeholder="contato@empresa.com" />
        </div>

        <div className="md:col-span-2">
          <label className={labelCls}>Telefone Comercial Principal</label>
          <input type="text" name="telefone" value={formData.telefone} onChange={handleChange}
            maxLength={15} className={inputCls} placeholder="(00) 0000-0000" />
        </div>

        <div className="md:col-span-4">
          <label className={labelCls}><FileText size={12} className="inline mr-1" />Observações da Parceria</label>
          <textarea name="observacoes" value={formData.observacoes} onChange={handleChange} rows={3}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 text-sm focus:border-slate-600 outline-none transition-all resize-none" placeholder="Condições, validade, observações de convênio..." />
        </div>
      </div>
    </div>

    {/* ══════════════ SEÇÃO 3: CONTATO / REPRESENTANTE LEGAL ══════════════ */}
    <div className="partner-registration-section bg-white p-5 rounded-2xl border border-slate-150 shadow-sm">
      <div className={sectionTitleCls}>
        <User size={16} />
        <span>Contato / Representante Legal</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="md:col-span-2">
          <label className={labelCls}>Nome do Representante / Contato</label>
          <input type="text" name="responsavelNome" value={formData.responsavelNome} onChange={handleChange}
            className={inputCls} placeholder="Nome completo do contato da empresa" />
        </div>

        <div>
          <label className={labelCls}>CPF do Representante / Contato</label>
          <input type="text" name="responsavelCpf" value={formData.responsavelCpf} onChange={handleChange}
            maxLength={14} className={`${inputCls} font-mono`} placeholder="000.000.000-00" />
        </div>

        <div>
          <label className={labelCls}>Cargo / Função</label>
          <input type="text" name="responsavelCargo" value={formData.responsavelCargo} onChange={handleChange}
            className={inputCls} placeholder="Ex: Diretor(a), Representante Legal, Coordenador(a)..." />
        </div>

        <div>
          <label className={labelCls}>E-mail do Representante / Contato</label>
          <input type="email" name="responsavelEmail" value={formData.responsavelEmail} onChange={handleChange}
            className={inputCls} placeholder="contato.responsavel@empresa.com" />
        </div>

        <div>
          <label className={labelCls}>Telefone do Representante / Contato</label>
          <input type="text" name="responsavelTelefone" value={formData.responsavelTelefone} onChange={handleChange}
            maxLength={15} className={inputCls} placeholder="(00) 00000-0000" />
        </div>
      </div>
    </div>

  </>
);

export default ParceiroPJFields;

import '../partner-registration.css';
// File: modules/gestor/parceiros/components/formularioparceiros/pj/ParceiroPJForm.tsx
// Formulário completo de Pessoa Jurídica (Empresa / Convenio) — Layout de Página Única

import React, { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import ParceiroPJFields from './ParceiroPJFields';
import type { PJFormData, PoloOption } from './parceiro-pj-form.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import CategoriaForm from '../../../../configuracoes/categorias/components/CategoriaForm';
import {
  categoriasQueryKeys,
  categoriasService,
} from '../../../../configuracoes/categorias/categorias.service';
import TipoParceriaForm from '../../../../configuracoes/tipos-parceria/components/TipoParceriaForm';
import {
  tiposParceriaQueryKeys,
  tiposParceriaService,
} from '../../../../configuracoes/tipos-parceria/tipos-parceria.service';
import { parceirosService } from '../../../parceiros.service';
import { defaultPjScope, pjPoloSelection } from '../../../utils/pj-polo-scope';

interface ParceiroPJFormProps {
  onCancel?: () => void;
  onSave?: (data: any) => void;
  defaultPoloId?: string | null;
  canAssociateAllPolos?: boolean;
  onScopeError?: (message: string) => void;
}


const ParceiroPJForm: React.FC<ParceiroPJFormProps> = ({
  onCancel,
  onSave,
  defaultPoloId,
  canAssociateAllPolos = false,
  onScopeError,
}) => {
  const queryClient = useQueryClient();
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [cnpjError, setCnpjError] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [tipoParceriaId, setTipoParceriaId] = useState('');
  const [showCategoriaForm, setShowCategoriaForm] = useState(false);
  const [showTipoParceriaForm, setShowTipoParceriaForm] = useState(false);
  const [polos, setPolos] = useState<PoloOption[]>([]);
  const [poloScope, setPoloScope] = useState<'active' | 'all' | string>(defaultPjScope(defaultPoloId, canAssociateAllPolos));

  const categoriasQuery = useQuery({
    queryKey: categoriasQueryKeys.activeByType('pj'),
    queryFn: () => categoriasService.getActiveByType('pj'),
  });
  const tiposParceriaQuery = useQuery({
    queryKey: tiposParceriaQueryKeys.active,
    queryFn: tiposParceriaService.getActive,
  });
  const createCategoriaMutation = useMutation({
    mutationFn: categoriasService.create,
    onSuccess: async (categoria) => {
      await queryClient.invalidateQueries({ queryKey: categoriasQueryKeys.all });
      setCategoriaId(categoria.id || '');
      setShowCategoriaForm(false);
    },
    onError: (error: Error) => alert(`Erro ao cadastrar categoria: ${error.message}`),
  });
  const createTipoParceriaMutation = useMutation({
    mutationFn: tiposParceriaService.create,
    onSuccess: async (tipo) => {
      await queryClient.invalidateQueries({ queryKey: tiposParceriaQueryKeys.all });
      setTipoParceriaId(tipo.id || '');
      setShowTipoParceriaForm(false);
    },
    onError: (error: Error) => alert(`Erro ao cadastrar tipo de parceria: ${error.message}`),
  });

  const [formData, setFormData] = useState<PJFormData>({
    // Empresa
    poloId: defaultPoloId || '',
    poloIds: defaultPoloId ? [defaultPoloId] : [],
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    tipoPj: '',
    tipoConvenio: '',
    foto: '',

    // Contato / Representante
    responsavelNome: '',
    responsavelCpf: '',
    responsavelCargo: '',
    responsavelEmail: '',
    responsavelTelefone: '',

    // Endereço & Contato Geral
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    email: '',
    telefone: '',
    observacoes: '',
  });

  useEffect(() => {
    if (!canAssociateAllPolos && poloScope !== 'active') {
      setPoloScope('active');
      const poloId = defaultPoloId || '';
      setFormData((previous) => ({
        ...previous,
        poloId,
        poloIds: poloId ? [poloId] : [],
      }));
      return;
    }
    if (poloScope !== 'active' || !defaultPoloId) return;

    setFormData((previous) => (previous.poloId
      ? previous
      : { ...previous, poloId: defaultPoloId, poloIds: [defaultPoloId] }));
  }, [canAssociateAllPolos, defaultPoloId, poloScope]);

  useEffect(() => {
    if (!canAssociateAllPolos) {
      setPolos([]);
      return undefined;
    }

    let active = true;
    parceirosService.getPolos()
      .then((data) => {
        if (active) setPolos(data);
      })
      .catch((error) => {
        console.error('Erro ao carregar polos para parceiro PJ:', error);
      });

    return () => {
      active = false;
    };
  }, [canAssociateAllPolos]);

  const maskCNPJ = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCPF = (v: string) => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
  const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
  const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingLogo(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData(prev => ({ ...prev, foto: url }));
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao fazer upload da logo: ${err.message || err}`);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const consultarCNPJ = async () => {
    const cleanCnpj = formData.cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) {
      setCnpjError('O CNPJ deve conter 14 dígitos.');
      return;
    }
    
    setIsSearchingCnpj(true);
    setCnpjError('');
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      if (!res.ok) {
        throw new Error('CNPJ não encontrado ou indisponível.');
      }
      const data = await res.json();
      
      const logradouroCompleto = [data.descricao_tipo_de_logradouro, data.logradouro]
        .filter(Boolean)
        .join(' ');

      let phoneVal = '';
      if (data.ddd_telefone_1) {
        phoneVal = data.ddd_telefone_1;
      } else if (data.ddd_telefone_2) {
        phoneVal = data.ddd_telefone_2;
      }
      
      if (phoneVal && /^\d+$/.test(phoneVal)) {
        if (phoneVal.length === 10) {
          phoneVal = `(${phoneVal.substring(0, 2)}) ${phoneVal.substring(2, 6)}-${phoneVal.substring(6)}`;
        } else if (phoneVal.length === 11) {
          phoneVal = `(${phoneVal.substring(0, 2)}) ${phoneVal.substring(2, 7)}-${phoneVal.substring(7)}`;
        }
      }

      setFormData(prev => ({
        ...prev,
        razaoSocial: (data.razao_social || '').toUpperCase(),
        nomeFantasia: (data.nome_fantasia || '').toUpperCase(),
        cep: data.cep ? maskCEP(data.cep) : prev.cep,
        logradouro: logradouroCompleto ? logradouroCompleto.toUpperCase() : prev.logradouro,
        numero: (data.numero || '').toUpperCase(),
        complemento: (data.complemento || '').toUpperCase(),
        bairro: (data.bairro || '').toUpperCase(),
        cidade: (data.municipio || '').toUpperCase(),
        uf: (data.uf || '').toUpperCase(),
        email: (data.email || '').toLowerCase(),
        telefone: phoneVal ? maskPhone(phoneVal) : prev.telefone,
      }));
    } catch (err: any) {
      console.error(err);
      setCnpjError('CNPJ não encontrado ou erro na busca.');
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue = value;
    if (type === 'text' || type === 'textarea' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (name !== 'email' && name !== 'responsavelEmail') {
        finalValue = value.toUpperCase();
      }
    }
    if (name === 'cnpj') finalValue = maskCNPJ(finalValue);
    if (name === 'responsavelCpf') finalValue = maskCPF(finalValue);
    if (name === 'cep') finalValue = maskCEP(finalValue);
    if (name === 'telefone' || name === 'responsavelTelefone') finalValue = maskPhone(finalValue);
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handlePoloScopeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextScope = event.target.value;
    setPoloScope(nextScope);

    if (nextScope === 'all') {
      setFormData((previous) => ({ ...previous, poloId: defaultPoloId || polos[0]?.id || '', poloIds: polos.map((polo) => polo.id) }));
      return;
    }

    const poloId = nextScope === 'active' ? defaultPoloId || '' : nextScope;
    setFormData((previous) => ({
      ...previous,
      poloId,
      poloIds: poloId ? [poloId] : [],
    }));
  };

  const handleCepBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          logradouro: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || '',
        }));
      }
    } catch {
      // ViaCEP failures should not block manual address entry.
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (poloScope !== 'all' && !formData.poloId) {
      onScopeError?.('Selecione um polo ativo no cabeçalho antes de cadastrar a parceria.');
      return;
    }
    if (poloScope === 'all' && (!canAssociateAllPolos || !polos.length)) {
      onScopeError?.('Aguarde o carregamento dos polos antes de salvar.');
      return;
    }
    const categoria = categoriasQuery.data?.find((item) => item.id === categoriaId);
    const tipoParceria = tiposParceriaQuery.data?.find((item) => item.id === tipoParceriaId);

    if (!tipoParceria) return;

    if (onSave) onSave({
      ...formData,
      ...(poloScope === 'all' ? pjPoloSelection(polos.map((polo) => polo.id), defaultPoloId) : {}),
      nome: formData.razaoSocial,
      nomeCompleto: formData.razaoSocial,
      cpf_cnpj: formData.cnpj,
      cpf: formData.cnpj,
      endereco: formData.logradouro,
      contato1: formData.telefone,
      observacao: formData.observacoes,
      categoriaId: categoria?.id || null,
      categoriaNome: categoria?.nome || null,
      tipoParceriaId: tipoParceria.id,
      tipoParceriaNome: tipoParceria.nome,
      tipoPj: categoria?.nome || null,
      tipoConvenio: tipoParceria.nome,
      responsavelCargo: formData.responsavelCargo,
      foto: formData.foto
    });
  };

  const inputCls = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-medium focus:border-slate-700 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-sm';
  const labelCls = 'block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 ml-0.5';
  const sectionTitleCls = 'text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-4 flex items-center gap-2';

  return (
    <div className="partner-registration max-h-[85vh] overflow-y-auto px-1 pr-3">
      {/* Header */}
      <div className="partner-registration-header flex justify-between items-center border-b border-slate-100 pb-5 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Novo Parceiro PJ</h3>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Empresa, Prefeitura ou Entidade</p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className="p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        
        <ParceiroPJFields {...{
          formData, setFormData, canAssociateAllPolos, poloScope, defaultPoloId, polos,
          inputCls, labelCls, sectionTitleCls, handleChange, handlePoloScopeChange,
          isSearchingCnpj, consultarCNPJ, cnpjError, isUploadingLogo, handleLogoUpload,
          categoriaId, setCategoriaId, categoriasQuery, setShowCategoriaForm,
          tipoParceriaId, setTipoParceriaId, tiposParceriaQuery, setShowTipoParceriaForm,
          handleCepBlur,
        }} />

        {/* Ações */}
        <div className="partner-registration-footer flex justify-end gap-3 pt-6 mt-6 border-t border-slate-100">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
          )}

          <button
            type="submit"
            disabled={!tipoParceriaId || tiposParceriaQuery.isLoading || tiposParceriaQuery.isError}
            className="flex items-center gap-2 px-8 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-slate-900/20 transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save size={16} /> Salvar Parceiro PJ
          </button>
        </div>
      </form>
      {showCategoriaForm ? (
        <CategoriaForm
          tipoFixo="pj"
          statusFixo="ativo"
          isSaving={createCategoriaMutation.isPending}
          onClose={() => setShowCategoriaForm(false)}
          onSave={(categoria) => createCategoriaMutation.mutate({ ...categoria, tipo: 'pj' })}
        />
      ) : null}
      {showTipoParceriaForm ? (
        <TipoParceriaForm
          statusFixo="ativo"
          isSaving={createTipoParceriaMutation.isPending}
          onClose={() => setShowTipoParceriaForm(false)}
          onSave={(tipo) => createTipoParceriaMutation.mutate(tipo)}
        />
      ) : null}
    </div>
  );
};

export default ParceiroPJForm;

import React, { useState, useEffect } from 'react';
import { Edit2, Building2, RefreshCw, MapPin, Phone, Mail, Shield } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import EmpresaForm from './components/EmpresaForm';
import { empresasService } from './empresas.service';
import { supabase } from '../../../../lib/supabase';

const EmpresasConfig: React.FC = () => {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // 1. Query para carregar a empresa principal
  const { data: company, isLoading, isError, error } = useQuery<any>({
    queryKey: ['empresa_principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
  });

  // 2. Realtime para atualizações em tempo real
  useEffect(() => {
    const channel = supabase
      .channel('empresa_principal_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'empresas' },
        () => {
          console.log('Alteração detectada na empresa principal, recarregando...');
          queryClient.invalidateQueries({ queryKey: ['empresa_principal'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutation para salvar
  const saveMutation = useMutation({
    mutationFn: (data: any) => empresasService.saveCompanyPrincipal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empresa_principal'] });
      queryClient.invalidateQueries({ queryKey: ['polos'] });
      setIsEditing(false);
    },
    onError: (err: any) => alert(`Erro ao salvar dados da empresa: ${err.message}`)
  });

  const handleSave = (data: any) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando dados da empresa...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center">
        <p className="text-red-600 font-bold">Erro ao carregar dados da empresa:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  // Se estiver no modo de edição ou se não houver nenhuma empresa cadastrada
  if (isEditing || !company) {
    return (
      <EmpresaForm 
        initialData={company || undefined} 
        onSave={handleSave} 
        onCancel={() => {
          if (!company) {
            alert('Você precisa cadastrar a Empresa Principal para prosseguir.');
            return;
          }
          setIsEditing(false);
        }} 
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto animate-fadeIn">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Dados da Empresa Principal</h3>
          <p className="text-slate-500 text-sm mt-1">Informações centrais e cadastrais da instituição mantenedora.</p>
        </div>
        
        <button 
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Edit2 size={16} /> Editar Informações
        </button>
      </div>

      {/* Grid Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Coluna Lateral - Logo & Resumo */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100/50 flex flex-col items-center text-center">
            <div className="w-40 h-40 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-center overflow-hidden mb-6 shadow-inner">
              {company.logoUrl ? (
                <img src={company.logoUrl} alt="Logo" className="w-full h-full object-contain p-4" />
              ) : (
                <Building2 size={64} className="text-slate-300" />
              )}
            </div>
            
            <h4 className="text-lg font-black text-[#001a33] uppercase tracking-tight">{company.nomeFantasia}</h4>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{company.razaoSocial || 'Sem Razão Social'}</p>
            
            <div className="w-full border-t border-slate-50 my-6"></div>
            
            <div className="w-full space-y-3">
              <div className="flex justify-between items-center bg-slate-50 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 uppercase">
                <span>Tipo</span>
                <span className="text-[#001a33]">{company.tipo || 'Matriz'}</span>
              </div>
              <div className="flex justify-between items-center bg-emerald-50 px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-700 uppercase">
                <span>Status</span>
                <span>{company.ativo ? 'Operando / Ativo' : 'Inativo'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna Central - Ficha Completa */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-100/50 space-y-8">
            
            {/* Bloco 1: Identificação */}
            <div>
              <h5 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Shield size={16} /> Identificação Jurídica
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Razão Social</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.razaoSocial || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CNPJ</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.cnpj || '-'}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-50"></div>

            {/* Bloco 2: Localização */}
            <div>
              <h5 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MapPin size={16} /> Endereço e Localização
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Logradouro / Endereço</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">
                    {company.endereco ? `${company.endereco}, ${company.numero || 'S/N'}` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bairro</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.bairro || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CEP</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.cep || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cidade</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.cidade || '-'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.uf || '-'}</p>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-50"></div>

            {/* Bloco 3: Contato */}
            <div>
              <h5 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Phone size={16} /> Canais de Contato
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Phone size={12} className="text-slate-300" /> Telefone
                  </p>
                  <p className="text-sm font-bold text-slate-700 mt-1">{company.telefone || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Mail size={12} className="text-slate-300" /> E-mail Institucional
                  </p>
                  <p className="text-sm font-bold text-slate-700 mt-1 text-ellipsis overflow-hidden">{company.email || '-'}</p>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

export default EmpresasConfig;

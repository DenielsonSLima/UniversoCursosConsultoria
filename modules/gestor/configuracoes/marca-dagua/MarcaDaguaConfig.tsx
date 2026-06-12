
import React, { useState, useEffect } from 'react';
import { Building2, Edit, RefreshCw } from 'lucide-react';
import WatermarkEditor from './components/WatermarkEditor';
import { marcaDaguaService, CompanyWatermark } from './marca-dagua.service';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../lib/supabase';

const MarcaDaguaConfig: React.FC = () => {
  const [selectedCompany, setSelectedCompany] = useState<CompanyWatermark | null>(null);
  const queryClient = useQueryClient();

  // 1. Carregar as empresas e suas marcas d'água do Supabase
  const { data: companies = [], isLoading, isError, error } = useQuery<CompanyWatermark[]>({
    queryKey: ['companies_watermarks'],
    queryFn: marcaDaguaService.getCompaniesWithWatermark,
  });

  // 2. Realtime para a tabela 'polos'
  useEffect(() => {
    const channel = supabase
      .channel('companies_watermarks_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'polos' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['companies_watermarks'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // 3. Mutation para salvar
  const saveWatermarkMutation = useMutation({
    mutationFn: (data: CompanyWatermark) => marcaDaguaService.saveWatermarkSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies_watermarks'] });
      setSelectedCompany(null);
      alert('Configuração de marca dágua salva com sucesso!');
    },
    onError: (err: any) => alert(`Erro ao salvar marca dágua: ${err.message}`),
  });

  const handleSave = async (data: CompanyWatermark) => {
    saveWatermarkMutation.mutate(data);
  };

  if (selectedCompany) {
    // Para garantir que o editor receba os dados mais recentes do cache do React Query se alterados em Realtime:
    const activeCompany = companies.find(c => c.id === selectedCompany.id) || selectedCompany;

    return (
      <div className="max-w-6xl mx-auto h-[800px]">
        <WatermarkEditor 
          company={activeCompany}
          onSave={handleSave}
          onCancel={() => setSelectedCompany(null)}
          isSaving={saveWatermarkMutation.isPending}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <RefreshCw className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-slate-500 font-medium">Carregando marcas d'água...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-100 text-center animate-fadeIn">
        <p className="text-red-600 font-bold">Erro ao carregar as marcas d'água:</p>
        <p className="text-red-500 text-sm mt-1">{(error as Error)?.message || 'Erro desconhecido'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn">
      <div className="border-b border-slate-100 pb-4 mb-8">
        <h3 className="text-2xl font-bold text-[#001a33]">Marca D'água por Unidade</h3>
        <p className="text-slate-500 text-sm">Selecione uma unidade para configurar a personalização dos documentos.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {companies.map((company) => (
          <div 
            key={company.id}
            onClick={() => setSelectedCompany(company)}
            className="group bg-white rounded-[2rem] border border-slate-100 p-6 cursor-pointer hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/10 transition-all duration-300 relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-6 relative z-10">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-[#001a33] border border-slate-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Building2 size={24} />
              </div>
              {company.watermarkUrl ? (
                <span className="bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase px-2 py-1 rounded-full border border-emerald-100">
                  Configurado
                </span>
              ) : (
                <span className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase px-2 py-1 rounded-full border border-slate-100">
                  Pendente
                </span>
              )}
            </div>

            <h3 className="text-lg font-black text-[#001a33] mb-1 group-hover:text-blue-600 transition-colors relative z-10">
              {company.nomeFantasia}
            </h3>
            <p className="text-xs text-slate-500 font-medium relative z-10">
              {company.cidade} - {company.uf}
            </p>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-slate-400 group-hover:text-blue-600 uppercase tracking-widest transition-colors relative z-10">
              <Edit size={14} className="mr-2" />
              Configurar Marca
            </div>

            {/* Background Preview Suave */}
            {company.watermarkUrl && (
              <div className="absolute -bottom-10 -right-10 w-40 h-40 opacity-[0.05] group-hover:opacity-10 transition-opacity">
                <img src={company.watermarkUrl} alt="" className="w-full h-full object-contain transform rotate-12" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MarcaDaguaConfig;

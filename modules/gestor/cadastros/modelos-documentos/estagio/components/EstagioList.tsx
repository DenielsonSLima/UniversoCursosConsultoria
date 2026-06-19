// File: modules/gestor/cadastros/modelos-documentos/estagio/components/EstagioList.tsx

import React, { useEffect, useState } from 'react';
import { Building2, ArrowRight, FileText, Settings } from 'lucide-react';
import { polosService } from '../../../../configuracoes/polos/polos.service';

interface EstagioListProps {
  onSelectPolo: (polo: any) => void;
  onConfigureQr: () => void;
}

const EstagioList: React.FC<EstagioListProps> = ({ onSelectPolo, onConfigureQr }) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPolos();
  }, []);

  const loadPolos = async () => {
    const data = await polosService.getAll();
    setPolos(data);
    setLoading(false);
  };

  if (loading) return <div className="p-12 text-center text-slate-500">Carregando unidades...</div>;

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <h3 className="text-xl font-bold text-[#001a33]">Selecione a Unidade</h3>
            <p className="text-slate-500 text-sm">Defina o modelo de termo de estágio específico para cada polo.</p>
        </div>
        
        {/* Botão de Configuração de QR Code */}
        <button 
            onClick={onConfigureQr}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#001a33] hover:text-white transition-colors border border-slate-200"
        >
            <Settings size={16} /> Configurar QR Code
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {polos.map((polo) => (
          <button
            key={polo.id}
            onClick={() => onSelectPolo(polo)}
            className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="w-14 h-14 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center border border-teal-100 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                <Building2 size={24} />
              </div>
              <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${polo.ativo ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                {polo.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            <h4 className="text-lg font-black text-[#001a33] mb-1 group-hover:text-teal-600 transition-colors">
              {polo.nomeFantasia}
            </h4>
            <p className="text-xs text-slate-500 font-medium mb-6">
              {polo.cidade} - {polo.uf}
            </p>

            <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider group-hover:text-teal-500 flex items-center gap-2">
                <FileText size={14} /> Configurar Modelo
              </span>
              <ArrowRight size={16} className="text-slate-300 group-hover:text-teal-600 group-hover:translate-x-1 transition-all" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default EstagioList;

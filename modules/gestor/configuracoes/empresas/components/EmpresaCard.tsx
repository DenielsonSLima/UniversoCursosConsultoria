
import React from 'react';
import { Building2, MapPin, Phone, Mail, Edit, Trash2, Power, PowerOff } from 'lucide-react';

interface EmpresaCardProps {
  data: any;
  onEdit: (data: any) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (data: any) => void;
}

const EmpresaCard: React.FC<EmpresaCardProps> = ({ data, onEdit, onDelete, onToggleStatus }) => {
  return (
    <div className={`bg-white rounded-[2rem] border transition-all duration-300 overflow-hidden group flex flex-col h-full ${
      data.ativo 
        ? 'border-slate-100 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-900/10' 
        : 'border-slate-100 opacity-75 grayscale hover:grayscale-0'
    }`}>
      {/* Header com Imagem/Logo */}
      <div className="h-32 bg-slate-50 relative border-b border-slate-100">
        {data.logoUrl ? (
          <img src={data.logoUrl} alt={data.nomeFantasia} className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <Building2 size={48} />
          </div>
        )}
        <div className="absolute top-4 right-4 flex gap-2">
            {!data.ativo && (
                <span className="bg-red-500/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-sm border border-red-400">
                    Inativo
                </span>
            )}
            <div className="bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-[#001a33] shadow-sm">
                {data.tipo || 'Filial'}
            </div>
        </div>
      </div>

      <div className="p-6 flex-1 flex flex-col">
        <h3 className={`text-xl font-black mb-1 ${data.ativo ? 'text-[#001a33]' : 'text-slate-500'}`}>
            {data.nomeFantasia}
        </h3>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-wide mb-4">{data.razaoSocial}</p>

        <div className="space-y-3 mb-6 flex-1">
          <div className="flex items-start gap-3">
            <MapPin size={16} className={`mt-0.5 shrink-0 ${data.ativo ? 'text-blue-500' : 'text-slate-400'}`} />
            <p className="text-sm text-slate-600 font-medium leading-tight">
              {data.endereco}, {data.numero}<br/>
              {data.bairro} • {data.cidade}/{data.uf}<br/>
              <span className="text-xs text-slate-400">CEP: {data.cep}</span>
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Phone size={16} className={`shrink-0 ${data.ativo ? 'text-blue-500' : 'text-slate-400'}`} />
            <p className="text-sm text-slate-600 font-medium">{data.telefone}</p>
          </div>

          <div className="flex items-center gap-3">
            <Mail size={16} className={`shrink-0 ${data.ativo ? 'text-blue-500' : 'text-slate-400'}`} />
            <p className="text-sm text-slate-600 font-medium truncate" title={data.email}>{data.email}</p>
          </div>
          
          <div className="pt-2 mt-2 border-t border-slate-50">
             <p className="text-[10px] font-bold text-slate-400 uppercase">CNPJ: {data.cnpj}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t border-slate-100">
          <button 
            onClick={() => onEdit(data)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs uppercase transition-colors ${
                data.ativo 
                ? 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white' 
                : 'bg-slate-50 text-slate-400 cursor-not-allowed'
            }`}
            disabled={!data.ativo}
            title={!data.ativo ? "Ative a empresa para editar" : "Editar"}
          >
            <Edit size={16} /> Editar
          </button>
          
          {/* Botão Inativar/Ativar */}
          <button 
            onClick={() => onToggleStatus(data)}
            className={`w-12 flex items-center justify-center rounded-xl transition-colors ${
                data.ativo 
                ? 'bg-slate-50 text-slate-400 hover:bg-orange-50 hover:text-orange-500' 
                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
            }`}
            title={data.ativo ? "Inativar Unidade" : "Ativar Unidade"}
          >
            {data.ativo ? <PowerOff size={16} /> : <Power size={16} />}
          </button>

          <button 
            onClick={() => onDelete(data.id)}
            className="w-12 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            title="Excluir Permanentemente"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmpresaCard;

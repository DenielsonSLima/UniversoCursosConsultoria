
// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoDados.tsx

import React, { useState } from 'react';
import { User, MapPin, Phone, Mail, Save, Upload, Camera } from 'lucide-react';
import { parceirosService } from '../../../../parceiros.service';

interface ParceiroAlunoDadosProps {
  aluno: any;
  onChange: (data: any) => void;
}

const ParceiroAlunoDados: React.FC<ParceiroAlunoDadosProps> = ({ aluno, onChange }) => {
  const [formData, setFormData] = useState(aluno);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const newData = { ...formData, [name]: value };
    setFormData(newData);
    onChange(newData); // Propaga a mudança para o pai (importante para a aba Responsável saber a idade)
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Seção de Foto e Dados Básicos */}
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Upload de Foto */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-40 h-40 rounded-full bg-slate-100 border-4 border-white shadow-lg relative overflow-hidden group cursor-pointer">
            {formData.foto ? (
                <img src={formData.foto} alt="Aluno" className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                    <User size={64} />
                </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="text-white" size={32} />
            </div>
          </div>
          <button className="text-xs font-bold text-blue-600 uppercase tracking-wider hover:underline">
            Alterar Foto
          </button>
        </div>

        {/* Identificação Principal */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Completo</label>
                <input 
                    type="text" name="nome" value={formData.nome} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
                <input 
                    type="text" name="cpf" value={formData.cpf} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-mono focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Data de Nascimento</label>
                <input 
                    type="date" name="dataNascimento" value={formData.dataNascimento} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Sexo</label>
                <select 
                    name="sexo" value={formData.sexo} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                >
                    <option value="">Selecione...</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outro">Outro</option>
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Status Acadêmico</label>
                <select 
                    name="status" value={formData.status} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none font-bold"
                >
                    <option value="Ativo">Ativo</option>
                    <option value="Inativo">Inativo</option>
                    <option value="Trancado">Trancado</option>
                    <option value="Formado">Formado</option>
                </select>
            </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Documentação Civil */}
      <div>
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-6 flex items-center gap-2">
            <span className="w-8 h-1 bg-blue-600 rounded-full"></span> Documentação Civil
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">RG</label>
                <input 
                    type="text" name="rg" value={formData.rg} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Órgão Emissor / UF</label>
                <input 
                    type="text" name="orgaoEmissor" value={formData.orgaoEmissor} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                    placeholder="Ex: SSP/SE"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nacionalidade</label>
                <input 
                    type="text" name="nacionalidade" value={formData.nacionalidade} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                    defaultValue="Brasileira"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Naturalidade</label>
                <input 
                    type="text" name="naturalidade" value={formData.naturalidade} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                    placeholder="Cidade de Nascimento"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Título de Eleitor</label>
                <input 
                    type="text" name="tituloEleitor" value={formData.tituloEleitor} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Reservista (Se houver)</label>
                <input 
                    type="text" name="reservista" value={formData.reservista} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Contato e Endereço */}
      <div>
        <h4 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-6 flex items-center gap-2">
            <span className="w-8 h-1 bg-blue-600 rounded-full"></span> Contato e Endereço
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Endereço Completo</label>
                <input 
                    type="text" name="endereco" value={formData.endereco} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
                <input 
                    type="email" name="email" value={formData.email} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone / WhatsApp</label>
                <input 
                    type="tel" name="contato1" value={formData.contato1} onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
                />
            </div>
        </div>
      </div>

      {/* Footer Action */}
      <div className="flex justify-end pt-4">
        <button 
          onClick={async () => {
            try {
              const updated = await parceirosService.update(aluno.id, formData);
              onChange(updated);
              alert('Dados do aluno atualizados com sucesso!');
            } catch (err) {
              alert('Erro ao atualizar dados do aluno.');
              console.error(err);
            }
          }}
          className="flex items-center gap-2 bg-[#001a33] text-white px-8 py-4 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg"
        >
            <Save size={16} /> Salvar Alterações
        </button>
      </div>

    </div>
  );
};

export default ParceiroAlunoDados;

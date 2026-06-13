// File: modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados.tsx

import React, { useState } from 'react';
import { Save, Edit2 } from 'lucide-react';

interface ParceiroProfessorDadosProps {
  data: any;
  onChange: (data: any) => void;
}

const ParceiroProfessorDados: React.FC<ParceiroProfessorDadosProps> = ({ data, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(data);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue = value;
    if (type === 'text' || e.target.tagName === 'SELECT') {
      if (name !== 'email') {
        finalValue = value.toUpperCase();
      }
    }
    const maskCPF = (v: string) => v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})/,'$1-$2').replace(/(-\d{2})\d+?$/,'$1');
    const maskCEP = (v: string) => v.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{3})\d+?$/,'$1');
    const maskPhone = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d)/,'$1-$2').replace(/(-\d{4})\d+?$/,'$1');
    const maskDate = (v: string) => v.replace(/\D/g,'').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2').replace(/(\/\d{4})\d+?$/,'$1');

    if (name === 'cpf') finalValue = maskCPF(finalValue);
    if (name === 'cep') finalValue = maskCEP(finalValue);
    if (name === 'telefone') finalValue = maskPhone(finalValue);
    if (name === 'dataNascimento') finalValue = maskDate(finalValue);

    setFormData({ ...formData, [name]: finalValue });
  };

  const handleSave = () => {
    onChange(formData);
    setIsEditing(false);
  };

  // Helper para renderizar os campos
  const DisplayField = ({ label, value }: { label: string, value: any }) => (
    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      <p className="font-medium text-[#001a33] mt-1">{value || <span className="text-slate-400 italic">Não informado</span>}</p>
    </div>
  );

  return (
    <div className="animate-fadeIn">
      {/* Dados Pessoais */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-black text-[#001a33] tracking-tight">Dados Pessoais</h3>
            {!isEditing && (
                <button 
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors"
                >
                  <Edit2 size={14} /> Editar
                </button>
            )}
        </div>

        {isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-1 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Completo</label>
                <input type="text" name="nome" value={formData.nome || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#001a33] font-bold focus:border-purple-500 outline-none" />
            </div>
            <div className="md:col-span-1 space-y-2">
                <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-500 uppercase ml-1">Nome Social</label>
                    <button type="button" onClick={() => setFormData({...formData, nomeSocial: formData.nome})} className="text-[10px] text-purple-600 font-bold uppercase tracking-wider hover:underline bg-purple-50 px-2 py-0.5 rounded">
                        Usar Completo
                    </button>
                </div>
                <input type="text" name="nomeSocial" value={formData.nomeSocial || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-700 focus:border-purple-500 outline-none" placeholder="Como prefere ser chamado" />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">CPF</label>
                <input type="text" name="cpf" value={formData.cpf || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
            <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Telefone</label>
                <input type="text" name="telefone" value={formData.telefone || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
             <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">E-mail</label>
                <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="md:col-span-2"><DisplayField label="Nome Completo" value={formData.nome} /></div>
            <DisplayField label="Nome Social" value={formData.nomeSocial || formData.nome} />
            <DisplayField label="CPF" value={formData.cpf} />
            <DisplayField label="Telefone" value={formData.telefone} />
            <DisplayField label="E-mail" value={formData.email} />
          </div>
        )}
      </section>

      {/* Endereço */}
      <section className="mb-12">
        <h3 className="text-lg font-black text-[#001a33] tracking-tight mb-6">Endereço</h3>
        {isEditing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">CEP</label>
                <input type="text" name="cep" value={formData.cep || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
            <div className="md:col-span-2 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Rua / Avenida</label>
                <input type="text" name="endereco" value={formData.endereco || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
            <div className="md:col-span-1 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Bairro</label>
                <input type="text" name="bairro" value={formData.bairro || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
            <div className="md:col-span-1 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Cidade</label>
                <input type="text" name="cidade" value={formData.cidade || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
             <div className="md:col-span-1 space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase ml-1">Estado</label>
                <input type="text" name="estado" value={formData.estado || ''} onChange={handleChange} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-purple-500 outline-none" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             <div className="md:col-span-1"><DisplayField label="CEP" value={formData.cep} /></div>
             <div className="md:col-span-2"><DisplayField label="Endereço" value={formData.endereco} /></div>
             <DisplayField label="Bairro" value={formData.bairro} />
             <DisplayField label="Cidade" value={formData.cidade} />
             <DisplayField label="Estado" value={formData.estado} />
          </div>
        )}
      </section>

      {/* Form Actions */}
      {isEditing && (
        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
           <button 
             onClick={() => {
                 setFormData(data);
                 setIsEditing(false);
             }}
             className="px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-500 uppercase tracking-widest text-xs hover:bg-slate-50 transition-colors"
           >
              Cancelar
           </button>
           <button 
             onClick={handleSave}
             className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#001a33] text-white font-bold uppercase tracking-widest text-xs hover:bg-purple-900 transition-colors shadow-lg shadow-purple-900/20"
           >
              <Save size={16} /> Salvar Alterações
           </button>
        </div>
      )}
    </div>
  );
};

export default ParceiroProfessorDados;

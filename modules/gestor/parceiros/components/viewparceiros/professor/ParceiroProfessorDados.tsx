// File: modules/gestor/parceiros/components/viewparceiros/professor/ParceiroProfessorDados.tsx

import React, { useState, useEffect } from 'react';
import { Save, Edit2, Camera, Loader2, User } from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { parceirosService } from '../../../parceiros.service';
import { formatCpf } from '../../../../../../lib/documentFormatters';

interface ParceiroProfessorDadosProps {
  data: any;
  onChange: (data: any) => void;
}

const ParceiroProfessorDados: React.FC<ParceiroProfessorDadosProps> = ({ data, onChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(data);
  const [polosList, setPolosList] = useState<any[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  useEffect(() => {
    const fetchPolos = async () => {
      try {
        const res = await parceirosService.getPolos();
        setPolosList(res);
      } catch (err) {
        console.error('Erro ao buscar polos:', err);
      }
    };
    fetchPolos();
  }, []);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const url = await empresasService.uploadLogo(file);
      setFormData((prev: any) => ({ ...prev, foto: url }));
    } catch (err: any) {
      alert('Erro ao enviar foto: ' + (err.message || err));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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

        <div className="flex flex-col md:flex-row gap-8 pt-4 mb-6">
          {/* Foto do Professor */}
          <div className="flex flex-col items-center gap-4 shrink-0">
            <div className="w-40 h-40 rounded-full bg-slate-100 border-4 border-white shadow-lg relative overflow-hidden group">
              {formData.foto ? (
                  <img src={formData.foto} alt="Professor" className="w-full h-full object-cover" />
              ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <User size={64} />
                  </div>
              )}
              {isEditing && !isUploadingPhoto && (
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Camera className="text-white" size={32} />
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              )}
              {isUploadingPhoto && (
                <div className="absolute inset-0 bg-black/45 flex items-center justify-center text-white">
                    <Loader2 className="animate-spin" size={32} />
                </div>
              )}
            </div>
            {isEditing && (
              <div className="flex gap-3">
                <label className="text-[10px] font-bold text-purple-600 uppercase tracking-wider hover:underline cursor-pointer">
                  Alterar Foto
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto} />
                </label>
                {formData.foto && (
                  <button
                    type="button"
                    onClick={() => setFormData((prev: any) => ({ ...prev, foto: '' }))}
                    className="text-[10px] font-bold text-red-500 uppercase tracking-wider hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="flex-1">
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
                <DisplayField label="CPF" value={formatCpf(formData.cpf)} />
                <DisplayField label="Telefone" value={formData.telefone} />
                <DisplayField label="E-mail" value={formData.email} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Polos / Vínculos de Unidade */}
      <section className="mb-12">
        <h3 className="text-lg font-black text-[#001a33] tracking-tight mb-6">Polos / Vínculos de Unidade</h3>
        {isEditing ? (
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2 ml-0.5">Polos Vinculados (Selecione um ou mais)</label>
            <div className="flex flex-wrap gap-3 mt-1">
              {polosList.map((poloItem) => {
                const isSelected = (formData.poloIds || []).includes(poloItem.id);
                return (
                  <button
                    type="button"
                    key={poloItem.id}
                    onClick={() => {
                      const currentPoloIds = formData.poloIds || [];
                      const isAlreadySelected = currentPoloIds.includes(poloItem.id);
                      let newPoloIds = [];
                      if (isAlreadySelected) {
                        newPoloIds = currentPoloIds.filter((id: string) => id !== poloItem.id);
                      } else {
                        newPoloIds = [...currentPoloIds, poloItem.id];
                      }
                      const firstPolo = newPoloIds[0] || '';
                      const poloKey = firstPolo === '44444444-4444-4444-4444-444444444444' 
                        ? 'matriz' 
                        : (firstPolo === '55555555-5555-5555-5555-555555555555' ? 'estancia' : 'matriz');
                      
                      setFormData((prev: any) => ({
                        ...prev,
                        poloIds: newPoloIds,
                        polo: poloKey
                      }));
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                      isSelected
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/10'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {poloItem.nome}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(formData.poloIds || []).length > 0 ? (
              (formData.poloIds || []).map((pId: string) => {
                const poloObj = polosList.find(p => p.id === pId);
                const pName = poloObj ? poloObj.nome : (pId === '44444444-4444-4444-4444-444444444444' ? 'Matriz - Aracaju' : 'Polo Estância');
                return (
                  <span key={pId} className="px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-xl text-xs font-bold uppercase tracking-wider">
                    {pName}
                  </span>
                );
              })
            ) : (
              <span className="text-slate-400 italic text-sm">Nenhum polo vinculado</span>
            )}
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

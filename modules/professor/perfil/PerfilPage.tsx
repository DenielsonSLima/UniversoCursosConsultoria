import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import { User, Phone, Mail, MapPin, Save, Award, Landmark, Wallet } from 'lucide-react';

interface PerfilPageProps {
  professorId: string;
}

const PerfilPage: React.FC<PerfilPageProps> = ({ professorId }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  // Form input states
  const [telefone, setTelefone] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [tipoConta, setTipoConta] = useState('');
  const [chavePix, setChavePix] = useState('');

  // 1. Fetch Teacher Profile details
  const { data: profile, isLoading } = useQuery({
    queryKey: ['professor-perfil', professorId],
    queryFn: async () => {
      const data = await parceirosService.getById(professorId);
      // Populate inputs
      setTelefone(data.telefone || '');
      setEspecialidade(data.especialidade || '');
      setBanco(data.banco || '');
      setAgencia(data.agencia || '');
      setConta(data.conta || '');
      setTipoConta(data.tipoConta || 'CORRENTE');
      setChavePix(data.chavePix || '');
      return data;
    }
  });

  // 2. Mutation to Update Profile
  const updateProfileMutation = useMutation({
    mutationFn: async (updatedFields: any) => {
      const merged = { ...profile, ...updatedFields };
      return parceirosService.update(professorId, merged);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['professor-perfil', professorId] });
      setEditing(false);
      alert('Cadastro e dados de pagamento atualizados com sucesso!');
    },
    onError: (err) => {
      console.error(err);
      alert('Erro ao atualizar cadastro.');
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      telefone,
      especialidade,
      banco,
      agencia,
      conta,
      tipoConta,
      chavePix
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-purple-650 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6 animate-fadeIn">
      
      {/* Header and edit actions */}
      <div className="flex justify-between items-center pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-50 text-purple-650 rounded-xl flex items-center justify-center">
            <User size={16} />
          </div>
          <h3 className="font-bold text-base text-[#001a33] uppercase tracking-tight">Ficha Cadastral Docente</h3>
        </div>
        
        <button 
          type="button"
          onClick={() => setEditing(!editing)}
          className="text-xs font-bold text-purple-600 hover:underline uppercase tracking-widest"
        >
          {editing ? 'Cancelar' : 'Alterar Dados'}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Personal Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Nome Completo</label>
            <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed">
              {profile?.nomeCompleto || profile?.nome}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">CPF/CNPJ</label>
            <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed">
              {profile?.cpf || profile?.cnpj || 'Não cadastrado'}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">E-mail para Contato</label>
            <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed flex items-center gap-2">
              <Mail size={13} className="text-slate-400" />
              {profile?.email || '—'}
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Telefone celular</label>
            {editing ? (
              <input 
                type="text" 
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
              />
            ) : (
              <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 flex items-center gap-2">
                <Phone size={13} className="text-slate-400" />
                {profile?.telefone || 'Não Informado'}
              </p>
            )}
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Especialidade / Titulação</label>
            {editing ? (
              <input 
                type="text" 
                placeholder="Ex: Anatomia Sistêmica, Especialista em Radioterapia"
                value={especialidade}
                onChange={(e) => setEspecialidade(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
              />
            ) : (
              <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 flex items-center gap-2">
                <Award size={13} className="text-slate-400" />
                {profile?.especialidade || 'Docente Geral'}
              </p>
            )}
          </div>
        </div>

        {/* Bank & Pix credentials */}
        <div className="pt-4 border-t border-slate-100">
          <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33] mb-4 flex items-center gap-1.5">
            <Landmark size={14} className="text-purple-500" /> Dados para Recebimento de Honorários
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Instituição Bancária</label>
              {editing ? (
                <input 
                  type="text" 
                  placeholder="Ex: Banco Itaú, Nubank"
                  value={banco}
                  onChange={(e) => setBanco(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                />
              ) : (
                <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">{profile?.banco || 'Não Informado'}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Agência</label>
              {editing ? (
                <input 
                  type="text" 
                  value={agencia}
                  onChange={(e) => setAgencia(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-750 text-center"
                />
              ) : (
                <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 text-center">{profile?.agencia || '—'}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Conta</label>
              {editing ? (
                <input 
                  type="text" 
                  value={conta}
                  onChange={(e) => setConta(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-750 text-center"
                />
              ) : (
                <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 text-center">{profile?.conta || '—'}</p>
              )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Tipo de Conta</label>
              {editing ? (
                <select 
                  value={tipoConta}
                  onChange={(e) => setTipoConta(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700 cursor-pointer"
                >
                  <option value="CORRENTE">Conta Corrente</option>
                  <option value="POUPANCA">Conta Poupança</option>
                </select>
              ) : (
                <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">{profile?.tipoConta || 'CORRENTE'}</p>
              )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px] flex items-center gap-1">
                <Wallet size={12} className="text-purple-550" /> Chave Pix Cadastrada
              </label>
              {editing ? (
                <input 
                  type="text" 
                  placeholder="E-mail, CPF, Telefone ou Chave Aleatória"
                  value={chavePix}
                  onChange={(e) => setChavePix(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                />
              ) : (
                <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 truncate">{profile?.chavePix || 'Não Cadastrada'}</p>
              )}
            </div>
          </div>
        </div>

        {editing && (
          <div className="flex justify-end pt-4 gap-2">
            <button 
              type="button" 
              onClick={() => setEditing(false)}
              className="px-5 py-3 bg-slate-100 hover:bg-slate-250 text-slate-650 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Voltar
            </button>
            <button 
              type="submit" 
              disabled={updateProfileMutation.isPending}
              className="px-5 py-3 bg-[#001a33] hover:bg-purple-650 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50"
            >
              {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar Dados'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default PerfilPage;

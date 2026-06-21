import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import { User, Phone, Mail, MapPin, Upload, FileText, CheckCircle, Clock, XCircle, ShieldAlert, Award } from 'lucide-react';

interface PerfilPageProps {
  alunoId: string;
}

const PerfilPage: React.FC<PerfilPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  // Form inputs for contact updates
  const [telefone, setTelefone] = useState('');
  const [cep, setCep] = useState('');
  const [endereco, setEndereco] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  // 1. Fetch Student Profile Cadastral Data
  const { data: profile, isLoading: loadingProfile } = useQuery({
    queryKey: ['aluno-perfil', alunoId],
    queryFn: async () => {
      const data = await parceirosService.getById(alunoId);
      // Initialize inputs
      setTelefone(data.telefone || '');
      setCep(data.cep || '');
      setEndereco(data.endereco || '');
      setNumero(data.numero || '');
      setBairro(data.bairro || '');
      setCidade(data.cidade || '');
      setUf(data.uf || '');
      return data;
    }
  });

  // 2. Fetch Student Documents checklist
  const { data: documentos = [], isLoading: loadingDocs } = useQuery({
    queryKey: ['aluno-documentos', alunoId],
    queryFn: () => parceirosService.getDocumentos(alunoId)
  });

  // 3. Mutation to Update Profile Contact Info
  const updateProfileMutation = useMutation({
    mutationFn: async (updatedData: any) => {
      // Merge with existing profile data
      const merged = { ...profile, ...updatedData };
      return parceirosService.update(alunoId, merged);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aluno-perfil', alunoId] });
      setEditing(false);
      alert('Cadastro atualizado com sucesso!');
    },
    onError: (err) => {
      console.error(err);
      alert('Erro ao atualizar cadastro.');
    }
  });

  // 4. Mutation to Upload Document
  const uploadDocMutation = useMutation({
    mutationFn: async ({ docName, file }: { docName: string; file: File }) => {
      return parceirosService.uploadDocumento(alunoId, docName, file);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['aluno-documentos', alunoId] });
      alert('Documento enviado com sucesso! Aguarde a homologação da secretaria.');
    },
    onError: (err) => {
      console.error(err);
      alert('Erro ao enviar documento. Certifique-se de que o arquivo seja PDF ou Imagem.');
    }
  });

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      telefone,
      cep,
      endereco,
      numero,
      bairro,
      cidade,
      uf
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, docName: string) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadDocMutation.mutate({ docName, file });
    }
  };

  const getDocStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'entregue':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-blue-100">
            <Clock size={10} /> Em Análise
          </span>
        );
      case 'aprovado':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Aprovado
          </span>
        );
      case 'recusado':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-red-100">
            <XCircle size={10} /> Pendente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-650 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-100">
            Pendente
          </span>
        );
    }
  };

  if (loadingProfile || loadingDocs) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
      
      {/* Profile Info Form Column */}
      <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <User size={16} />
            </div>
            <h3 className="font-bold text-base text-[#001a33] uppercase tracking-tight">Dados Cadastrais</h3>
          </div>
          
          <button 
            type="button"
            onClick={() => setEditing(!editing)}
            className="text-xs font-bold text-blue-600 hover:underline uppercase tracking-widest"
          >
            {editing ? 'Cancelar' : 'Alterar Contato'}
          </button>
        </div>

        <form onSubmit={handleUpdateSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Nome Completo</label>
              <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed">
                {profile?.nomeCompleto || profile?.nome}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">CPF</label>
              <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed">
                {profile?.cpf || 'Não Informado'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">E-mail Acadêmico</label>
              <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed flex items-center gap-2">
                <Mail size={13} className="text-slate-400" />
                {profile?.email || 'Sem email'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Telefone celular</label>
              {editing ? (
                <input 
                  type="text" 
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                />
              ) : (
                <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 flex items-center gap-2">
                  <Phone size={13} className="text-slate-400" />
                  {profile?.telefone || 'Não Informado'}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="font-bold text-xs uppercase tracking-wider text-[#001a33] mb-4 flex items-center gap-1.5">
              <MapPin size={14} className="text-blue-500" /> Endereço Residencial
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">CEP</label>
                {editing ? (
                  <input 
                    type="text" 
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                  />
                ) : (
                  <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">{profile?.cep || '—'}</p>
                )}
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Logradouro / Endereço</label>
                {editing ? (
                  <input 
                    type="text" 
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                  />
                ) : (
                  <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 truncate">{profile?.endereco || '—'}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Número</label>
                {editing ? (
                  <input 
                    type="text" 
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                  />
                ) : (
                  <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">{profile?.numero || 'S/N'}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Bairro</label>
                {editing ? (
                  <input 
                    type="text" 
                    value={bairro}
                    onChange={(e) => setBairro(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                  />
                ) : (
                  <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">{profile?.bairro || '—'}</p>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Cidade / UF</label>
                {editing ? (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="Cidade"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-700"
                    />
                    <input 
                      type="text" 
                      placeholder="UF"
                      maxLength={2}
                      value={uf}
                      onChange={(e) => setUf(e.target.value)}
                      className="w-16 p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 focus:bg-white transition-all font-bold text-slate-750 text-center"
                    />
                  </div>
                ) : (
                  <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100 truncate">
                    {profile?.cidade ? `${profile.cidade} / ${profile.uf || 'SE'}` : '—'}
                  </p>
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
                className="px-5 py-3 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50"
              >
                {updateProfileMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Required Documents checklist column */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 shadow-sm space-y-5">
        <div className="pb-4 border-b border-slate-100 flex items-center gap-2">
          <FileText className="text-blue-600" size={18} />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Documentação Escolar</h3>
        </div>

        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
          Para homologar sua matrícula definitiva, envie cópias legíveis em formato PDF ou Imagem dos seus documentos.
        </p>

        <div className="space-y-4.5">
          {documentos.length === 0 ? (
            /* Standard checklist placeholder if empty in DB */
            ['Registro Geral (RG)', 'CPF ou CNH', 'Histórico Escolar Ensino Médio', 'Comprovante de Residência'].map((docName, i) => (
              <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 text-xs font-medium">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#001a33]">{docName}</p>
                    <p className="text-[9px] text-slate-400">Pendente de entrega</p>
                  </div>
                  <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded">
                    Pendente
                  </span>
                </div>
                
                <label className="flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer hover:bg-white text-[10px] font-black text-slate-500 hover:text-blue-600 transition-all">
                  <Upload size={14} />
                  <span>Escolher Arquivo</span>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf"
                    className="hidden" 
                    onChange={(e) => handleFileChange(e, docName)} 
                  />
                </label>
              </div>
            ))
          ) : (
            documentos.map((doc: any) => (
              <div key={doc.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3 text-xs font-medium">
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-0.5">
                    <p className="font-bold text-[#001a33]">{doc.nome}</p>
                    {doc.observacao && <p className="text-[9px] text-red-500 font-bold">{doc.observacao}</p>}
                  </div>
                  {getDocStatusBadge(doc.status)}
                </div>
                
                {/* Upload action if not approved */}
                {doc.status !== 'aprovado' && (
                  <label className="flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 hover:border-blue-500 rounded-xl cursor-pointer hover:bg-white text-[10px] font-black text-slate-500 hover:text-blue-600 transition-all">
                    <Upload size={14} />
                    <span>{doc.status === 'entregue' ? 'Reenviar Arquivo' : 'Escolher Arquivo'}</span>
                    <input 
                      type="file" 
                      accept="image/*,application/pdf"
                      className="hidden" 
                      onChange={(e) => handleFileChange(e, doc.nome)} 
                    />
                  </label>
                )}

                {doc.status === 'aprovado' && doc.arquivoUrl && (
                  <a 
                    href={doc.arquivoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-center py-2 text-[10px] font-black uppercase text-blue-600 hover:underline"
                  >
                    Visualizar Documento Homologado
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};

export default PerfilPage;

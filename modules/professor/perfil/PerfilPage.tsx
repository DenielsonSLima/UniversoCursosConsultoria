import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import { Award, KeyRound, Landmark, Link2, Mail, Phone, ShieldCheck, User, Wallet } from 'lucide-react';
import GoogleIdentityCard from '../../shared/auth/GoogleIdentityCard';
import { loginService } from '../../login/login.service';

interface PerfilPageProps {
  professorId: string;
}

type PerfilTab = 'dados' | 'seguranca' | 'google';

const maskDate = (value: string) => value
  .replace(/\D/g, '')
  .replace(/(\d{2})(\d)/, '$1/$2')
  .replace(/(\d{2})(\d)/, '$1/$2')
  .slice(0, 10);

const PerfilPage: React.FC<PerfilPageProps> = ({ professorId }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<PerfilTab>('dados');
  const [editing, setEditing] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const [nomeCompleto, setNomeCompleto] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
  const [rg, setRg] = useState('');
  const [orgaoEmissor, setOrgaoEmissor] = useState('');
  const [rgUfEmissao, setRgUfEmissao] = useState('');
  const [rgDataEmissao, setRgDataEmissao] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [registroProfissional, setRegistroProfissional] = useState('');
  const [numeroRegistro, setNumeroRegistro] = useState('');
  const [banco, setBanco] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [tipoConta, setTipoConta] = useState('');
  const [chavePix, setChavePix] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['professor-perfil', professorId],
    queryFn: async () => {
      const data = await parceirosService.getById(professorId);
      setNomeCompleto(data.nomeCompleto || data.nome || '');
      setDataNascimento(data.dataNascimento || '');
      setTelefone(data.telefone || '');
      setTipoDocumento(data.tipoDocumento || 'CARTEIRA NACIONAL DE IDENTIFICAÇÃO');
      setRg(data.rg || '');
      setOrgaoEmissor(data.orgaoEmissor || '');
      setRgUfEmissao(data.rgUfEmissao || '');
      setRgDataEmissao(data.rgDataEmissao || '');
      setEspecialidade(data.especialidade || '');
      setRegistroProfissional(data.registroProfissional || '');
      setNumeroRegistro(data.numeroRegistro || '');
      setBanco(data.banco || '');
      setAgencia(data.agencia || '');
      setConta(data.conta || '');
      setTipoConta(data.tipoConta || 'CORRENTE');
      setChavePix(data.chavePix || '');
      return data;
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (updatedFields: any) => {
      const { email, cpf, cnpj, nome, nomeCompleto, ...editableProfile } = profile || {};
      const merged = { ...editableProfile, ...updatedFields };
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
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async () => {
      const error = await loginService.updatePassword(novaSenha);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      setNovaSenha('');
      setConfirmarSenha('');
      setPasswordMessage({ tone: 'success', text: 'Senha alterada com sucesso.' });
    },
    onError: (error) => {
      setPasswordMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Não foi possível alterar a senha.',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({
      nomeCompleto,
      dataNascimento,
      telefone,
      tipoDocumento,
      rg,
      orgaoEmissor,
      rgUfEmissao,
      rgDataEmissao,
      especialidade,
      registroProfissional,
      numeroRegistro,
      banco,
      agencia,
      conta,
      tipoConta,
      chavePix,
    });
  };

  const handlePasswordSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordMessage(null);

    if (novaSenha.length < 6 || !/[A-Z]/.test(novaSenha) || !/[a-z]/.test(novaSenha) || !/\d/.test(novaSenha)) {
      setPasswordMessage({
        tone: 'error',
        text: 'A senha deve ter no mínimo 6 caracteres, 1 maiúscula, 1 minúscula e 1 número.',
      });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setPasswordMessage({ tone: 'error', text: 'As senhas não conferem.' });
      return;
    }

    updatePasswordMutation.mutate();
  };

  const tabItems: { id: PerfilTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dados', label: 'Dados e Pagamento', icon: <User size={15} /> },
    { id: 'seguranca', label: 'Segurança', icon: <KeyRound size={15} /> },
    { id: 'google', label: 'Conta Google', icon: <Link2 size={15} /> },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-purple-650 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-5 md:p-6 shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-650">
              <User size={18} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight text-[#001a33]">Meu Perfil</h3>
              <p className="text-xs font-semibold text-slate-500">Dados cadastrais, segurança e login social.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl bg-slate-50 p-1">
            {tabItems.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${
                  activeTab === tab.id
                    ? 'bg-[#001a33] text-white shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-[#001a33]'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'dados' && (
          <div className="pt-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Ficha Cadastral Docente</h4>
                <p className="mt-1 text-xs font-semibold text-slate-500">Contato, especialidade e recebimento de honorários.</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(!editing)}
                className="rounded-xl border border-purple-100 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-purple-650 transition hover:bg-purple-50"
              >
                {editing ? 'Cancelar' : 'Alterar Dados'}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Nome Completo</label>
                  {editing ? (
                    <input
                      type="text"
                      value={nomeCompleto}
                      onChange={(e) => setNomeCompleto(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                    />
                  ) : (
                    <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent">
                      {profile?.nomeCompleto || profile?.nome}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">CPF/CNPJ</label>
                  <p className="p-3 bg-slate-50 rounded-xl font-bold text-slate-800 border border-transparent cursor-not-allowed">
                    {profile?.cpf || profile?.cnpj || 'Não cadastrado'}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Data de Nascimento</label>
                  {editing ? (
                    <input
                      type="text"
                      value={dataNascimento}
                      maxLength={10}
                      onChange={(e) => setDataNascimento(maskDate(e.target.value))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                      placeholder="DD/MM/AAAA"
                    />
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.dataNascimento || 'Não Informada'}
                    </p>
                  )}
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

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Tipo de Documento</label>
                  {editing ? (
                    <select
                      value={tipoDocumento}
                      onChange={(e) => setTipoDocumento(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                    >
                      <option value="CARTEIRA NACIONAL DE IDENTIFICAÇÃO">Carteira Nacional de Identificação</option>
                      <option value="RG">RG</option>
                      <option value="CNH">CNH</option>
                      <option value="PASSAPORTE">Passaporte</option>
                      <option value="CARTEIRA PROFISSIONAL">Carteira Profissional</option>
                      <option value="OUTRO">Outro documento oficial</option>
                    </select>
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.tipoDocumento || 'Carteira Nacional de Identificação'}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Número do Documento</label>
                  {editing ? (
                    <input
                      type="text"
                      value={rg}
                      onChange={(e) => setRg(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                      placeholder="RG, CNH, CIN..."
                    />
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.rg || 'Não Informado'}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Órgão Emissor</label>
                  {editing ? (
                    <input
                      type="text"
                      value={orgaoEmissor}
                      onChange={(e) => setOrgaoEmissor(e.target.value.toUpperCase())}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                      placeholder="SSP, DETRAN..."
                    />
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.orgaoEmissor || 'Não Informado'}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">UF Emissão</label>
                  {editing ? (
                    <input
                      type="text"
                      value={rgUfEmissao}
                      maxLength={2}
                      onChange={(e) => setRgUfEmissao(e.target.value.toUpperCase())}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                      placeholder="UF"
                    />
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.rgUfEmissao || '—'}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Data de Emissão</label>
                  {editing ? (
                    <input
                      type="text"
                      value={rgDataEmissao}
                      maxLength={10}
                      onChange={(e) => setRgDataEmissao(maskDate(e.target.value))}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                      placeholder="DD/MM/AAAA"
                    />
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.rgDataEmissao || '—'}
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

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Conselho / Registro</label>
                  {editing ? (
                    <select
                      value={registroProfissional}
                      onChange={(e) => setRegistroProfissional(e.target.value)}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                    >
                      <option value="">Não se aplica</option>
                      <option value="COREN">COREN</option>
                      <option value="CRF">CRF</option>
                      <option value="CREFITO">CREFITO</option>
                      <option value="CRM">CRM</option>
                      <option value="CRN">CRN</option>
                      <option value="CRO">CRO</option>
                      <option value="CRP">CRP</option>
                      <option value="CREA">CREA</option>
                      <option value="CAU">CAU</option>
                      <option value="OAB">OAB</option>
                      <option value="OUTRO">Outro</option>
                    </select>
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.registroProfissional || 'Não se aplica'}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Número do Registro</label>
                  {editing ? (
                    <input
                      type="text"
                      value={numeroRegistro}
                      onChange={(e) => setNumeroRegistro(e.target.value.toUpperCase())}
                      className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-purple-500 focus:bg-white transition-all font-bold text-slate-700"
                      placeholder="Ex: COREN-SE 123456"
                    />
                  ) : (
                    <p className="p-3 bg-slate-50/50 rounded-xl font-bold text-slate-850 border border-slate-100">
                      {profile?.numeroRegistro || 'Não Informado'}
                    </p>
                  )}
                </div>
              </div>

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
        )}

        {activeTab === 'seguranca' && (
          <div className="pt-6">
            <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail de acesso</p>
                    <p className="mt-1 text-sm font-black text-[#001a33]">{profile?.email || 'Não informado'}</p>
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold leading-relaxed text-slate-500">
                  Este é o e-mail usado para entrar no portal institucional. Alterações de e-mail devem ser solicitadas à gestão.
                </p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <ShieldCheck size={17} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Alterar senha</h4>
                    <p className="text-xs font-semibold text-slate-500">A nova senha valerá no próximo login.</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nova senha</label>
                    <input
                      type="password"
                      value={novaSenha}
                      onChange={(event) => setNovaSenha(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white"
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Confirmar senha</label>
                    <input
                      type="password"
                      value={confirmarSenha}
                      onChange={(event) => setConfirmarSenha(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-bold text-slate-700 outline-none transition focus:border-emerald-500 focus:bg-white"
                      placeholder="Repita a senha"
                    />
                  </div>
                </div>

                <p className="mt-3 text-[11px] font-semibold text-slate-500">
                  Use no mínimo 6 caracteres, com letra maiúscula, minúscula e número.
                </p>

                {passwordMessage && (
                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-xs font-bold ${
                    passwordMessage.tone === 'success'
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-red-100 bg-red-50 text-red-700'
                  }`}>
                    {passwordMessage.text}
                  </div>
                )}

                <div className="mt-5 flex justify-end">
                  <button
                    type="submit"
                    disabled={updatePasswordMutation.isPending}
                    className="rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updatePasswordMutation.isPending ? 'Alterando...' : 'Alterar senha'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'google' && (
          <div className="pt-6">
            <div className="mb-5">
              <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Conta Google</h4>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Vincule ou remova uma conta Google para facilitar o acesso ao portal.
              </p>
            </div>
            <GoogleIdentityCard tone="purple" />
          </div>
        )}
      </div>
    </div>
  );
};

export default PerfilPage;

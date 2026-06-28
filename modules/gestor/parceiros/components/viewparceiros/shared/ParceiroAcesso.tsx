// File: modules/gestor/parceiros/components/viewparceiros/shared/ParceiroAcesso.tsx

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Mail, ShieldCheck, Unlink2 } from 'lucide-react';
import GoogleLogo from '../../../../../shared/auth/GoogleLogo';
import { portalActivationService } from '../../../portal-activation.service';

interface ParceiroAcessoProps {
  parceiroId: string;
  email: string;
  tipo?: 'Aluno' | 'Professor';
}

const ParceiroAcesso: React.FC<ParceiroAcessoProps> = ({ parceiroId, email, tipo = 'Aluno' }) => {
  const queryClient = useQueryClient();
  const [novoEmail, setNovoEmail] = useState(email);
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [googleHint, setGoogleHint] = useState('');

  React.useEffect(() => {
    setNovoEmail(email);
  }, [email]);

  const googleStatusQuery = useQuery({
    queryKey: ['partner-google-identity-status', parceiroId],
    queryFn: () => portalActivationService.getPartnerGoogleIdentityStatus(parceiroId),
    enabled: Boolean(parceiroId),
    staleTime: 15_000,
  });

  const googleStatus = googleStatusQuery.data;
  const googleLinked = Boolean(googleStatus?.google_linked);

  const unlinkGoogleMutation = useMutation({
    mutationFn: () => portalActivationService.unlinkPartnerGoogleIdentity(parceiroId),
    onSuccess: (message) => {
      setGoogleHint(message);
      queryClient.invalidateQueries({ queryKey: ['partner-google-identity-status', parceiroId] });
    },
    onError: (error: any) => {
      const message = error?.message || 'Não foi possível desvincular o Google.';
      setGoogleHint(message);
      alert(message);
    },
  });

  const googleDescription = (() => {
    if (googleStatusQuery.isLoading) return 'Verificando vínculo Google...';
    if (googleStatusQuery.error) return googleStatusQuery.error instanceof Error ? googleStatusQuery.error.message : 'Não foi possível verificar o vínculo Google.';
    if (googleHint) return googleHint;
    if (!googleStatus?.email) return 'Este cadastro ainda não possui e-mail de login informado.';
    if (!googleStatus.has_auth_user) return 'Nenhum usuário de autenticação foi encontrado para este e-mail.';
    if (googleLinked) return `Google vinculado${googleStatus.google_email ? ` em ${googleStatus.google_email}` : ''}.`;
    return `Nenhum Google vinculado para este ${tipo.toLowerCase()}.`;
  })();
  
  return (
    <div className="space-y-8 animate-fadeIn max-w-3xl">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <KeyRound size={24} />
        </div>
        <div>
            <h3 className="text-xl font-black text-[#001a33] tracking-tight">Acesso ao Sistema</h3>
            <p className="text-sm text-slate-500 font-medium">Gerencie as credenciais de acesso deste usuário.</p>
        </div>
      </div>

      <div className="space-y-6">
          {/* Email de Acesso */}
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">
                  <Mail size={16} className="text-blue-600" />
                  E-mail de Login
              </h4>
              <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                       <input 
                           type="email" 
                           value={novoEmail}
                           onChange={(e) => setNovoEmail(e.target.value)}
                           className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-blue-500 outline-none font-medium text-slate-700" 
                           placeholder="usuario@email.com"
                       />
                  </div>
                  <button className="px-6 py-3 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors shrink-0">
                      Atualizar E-mail
                  </button>
              </div>
          </div>

          <div className={`p-6 border rounded-2xl ${googleLinked ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 rounded-2xl flex shrink-0 items-center justify-center ${googleLinked ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-500 border border-slate-200'}`}>
                          {googleLinked ? <CheckCircle2 size={20} /> : <GoogleLogo className="h-5 w-5" />}
                      </div>
                      <div>
                          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-1">
                              Login com Google
                          </h4>
                          <p className="text-xs font-medium leading-relaxed text-slate-500">
                              {googleDescription}
                          </p>
                      </div>
                  </div>
                  <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Deseja desvincular a conta Google deste ${tipo.toLowerCase()}?`)) {
                          unlinkGoogleMutation.mutate();
                        }
                      }}
                      disabled={!googleLinked || unlinkGoogleMutation.isPending || googleStatusQuery.isLoading}
                      className="px-6 py-3 bg-white border border-red-100 text-red-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center gap-2"
                  >
                      {unlinkGoogleMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Unlink2 size={14} />}
                      Desvincular Google
                  </button>
              </div>
          </div>

          {/* Redefinição de Senha */}
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
              <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-widest mb-4">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  Redefinir Senha
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Nova Senha</label>
                       <input 
                           type="password" 
                           value={novaSenha}
                           onChange={(e) => setNovaSenha(e.target.value)}
                           className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-emerald-500 outline-none font-medium text-slate-700" 
                           placeholder="••••••••"
                       />
                  </div>
                  <div className="space-y-2">
                       <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Confirmar Nova Senha</label>
                       <input 
                           type="password" 
                           value={confirmarSenha}
                           onChange={(e) => setConfirmarSenha(e.target.value)}
                           className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:border-emerald-500 outline-none font-medium text-slate-700" 
                           placeholder="••••••••"
                       />
                  </div>
              </div>
              <div className="flex justify-between items-center mt-6">
                 <p className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <AlertTriangle size={14} className="text-amber-500" />
                    O usuário precisará usar a nova senha na próxima vez que logar.
                 </p>
                 <button className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors">
                     Redefinir Manualmente
                 </button>
              </div>
          </div>

          {/* Opções extras */}
          <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-200 rounded-2xl">
              <div>
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-1">
                      Link de Recuperação
                  </h4>
                  <p className="text-xs font-medium text-slate-500">
                      Envia um e-mail com um link seguro para o usuário criar uma nova senha.
                  </p>
              </div>
              <button className="px-6 py-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors">
                  Enviar E-mail de Recuperação
              </button>
          </div>
      </div>
    </div>
  );
};

export default ParceiroAcesso;

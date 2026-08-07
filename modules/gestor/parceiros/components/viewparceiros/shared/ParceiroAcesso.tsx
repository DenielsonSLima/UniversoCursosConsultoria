import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  Unlink2,
  UserRound,
} from 'lucide-react';
import GoogleLogo from '../../../../../shared/auth/GoogleLogo';
import { portalActivationService } from '../../../portal-activation.service';
import { buildAuthRedirectUrl } from '../../../../../../lib/app-url';

interface ParceiroAcessoProps {
  parceiroId: string;
  email?: string | null;
  matriculaAcesso?: string | null;
  tipo?: 'Aluno' | 'Professor';
  acessoStatus?: string | null;
  acessoErro?: string | null;
}

const ParceiroAcesso: React.FC<ParceiroAcessoProps> = ({
  parceiroId,
  email,
  matriculaAcesso,
  tipo = 'Aluno',
  acessoStatus,
  acessoErro,
}) => {
  const queryClient = useQueryClient();
  const [googleHint, setGoogleHint] = useState('');
  const [accessHint, setAccessHint] = useState('');
  const [recoveryLink, setRecoveryLink] = useState('');

  const googleStatusQuery = useQuery({
    queryKey: ['partner-google-identity-status', parceiroId],
    queryFn: () => portalActivationService.getPartnerGoogleIdentityStatus(parceiroId),
    enabled: Boolean(parceiroId),
    staleTime: 15_000,
  });

  const googleStatus = googleStatusQuery.data;
  const googleLinked = Boolean(googleStatus?.google_linked);

  const accessMutation = useMutation({
    mutationFn: () => portalActivationService.ensureStudentAccess({
      partnerId: parceiroId,
      email: email || undefined,
      redirectTo: buildAuthRedirectUrl('/recuperar-senha'),
    }),
    onSuccess: (result) => {
      setAccessHint(result.message || 'Acesso preparado com sucesso.');
      setRecoveryLink(result.recoveryLink || '');
      queryClient.invalidateQueries({
        queryKey: ['partner-google-identity-status', parceiroId],
      });
      queryClient.invalidateQueries({ queryKey: ['parceiro', parceiroId] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
    },
    onError: (error: any) => {
      setRecoveryLink('');
      setAccessHint(error?.message || 'Não foi possível preparar o acesso do aluno.');
    },
  });

  const unlinkGoogleMutation = useMutation({
    mutationFn: () => portalActivationService.unlinkPartnerGoogleIdentity(parceiroId),
    onSuccess: (message) => {
      setGoogleHint(message);
      queryClient.invalidateQueries({
        queryKey: ['partner-google-identity-status', parceiroId],
      });
    },
    onError: (error: any) => {
      const message = error?.message || 'Não foi possível desvincular o Google.';
      setGoogleHint(message);
      alert(message);
    },
  });

  const copyRecoveryLink = async () => {
    if (!recoveryLink) return;
    await navigator.clipboard.writeText(recoveryLink);
    setAccessHint('Link copiado. Envie somente após confirmar a identidade do aluno.');
  };

  const googleDescription = (() => {
    if (googleStatusQuery.isLoading) return 'Verificando vínculo Google...';
    if (googleStatusQuery.error) {
      return googleStatusQuery.error instanceof Error
        ? googleStatusQuery.error.message
        : 'Não foi possível verificar o vínculo Google.';
    }
    if (googleHint) return googleHint;
    if (!googleStatus?.email) return 'Este cadastro ainda não possui e-mail informado.';
    if (!googleStatus.has_auth_user) return 'Nenhum usuário de autenticação foi encontrado para este e-mail.';
    if (googleLinked) {
      return `Google vinculado${googleStatus.google_email ? ` em ${googleStatus.google_email}` : ''}.`;
    }
    return `Nenhum Google vinculado para este ${tipo.toLowerCase()}.`;
  })();

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <KeyRound size={24} />
        </div>
        <div>
          <h3 className="text-xl font-black tracking-tight text-[#001a33]">
            Acesso ao Sistema
          </h3>
          <p className="text-sm font-medium text-slate-500">
            Gerencie a identidade e a recuperação de acesso deste usuário.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {tipo === 'Aluno' && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
            <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-800">
              <UserRound size={16} className="text-blue-600" />
              Matrícula de acesso
            </h4>
            <input
              type="text"
              readOnly
              value={matriculaAcesso || 'Gerada automaticamente pelo sistema'}
              className="w-full rounded-xl border border-blue-100 bg-white px-4 py-3 font-black tracking-wider text-slate-800"
            />
            <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
              Identificador permanente para entrar no portal. Ele não contém CPF e não muda quando o aluno troca de curso.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-800">
            <Mail size={16} className="text-blue-600" />
            E-mail cadastral
          </h4>
          <input
            type="text"
            readOnly
            value={email || 'Não informado — acesso disponível pela matrícula'}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-700"
          />
        </div>

        <div className={`rounded-2xl border p-6 ${
          googleLinked
            ? 'border-emerald-100 bg-emerald-50'
            : 'border-slate-200 bg-slate-50'
        }`}>
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                googleLinked
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'border border-slate-200 bg-white text-slate-500'
              }`}>
                {googleLinked
                  ? <CheckCircle2 size={20} />
                  : <GoogleLogo className="h-5 w-5" />}
              </div>
              <div>
                <h4 className="mb-1 text-sm font-bold uppercase tracking-widest text-slate-800">
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
              className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-100 bg-white px-6 py-3 text-xs font-bold uppercase tracking-wider text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {unlinkGoogleMutation.isPending
                ? <Loader2 className="animate-spin" size={14} />
                : <Unlink2 size={14} />}
              Desvincular Google
            </button>
          </div>
        </div>

        {tipo === 'Aluno' && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Situação do acesso
              </p>
              <p className="mt-1 text-sm font-bold text-slate-800">
                {{
                  sem_acesso: 'Acesso ainda não preparado',
                  pendente: 'Preparação ou envio pendente',
                  processando: 'Preparando acesso',
                  convite_enviado: 'Convite enviado — aguardando o aluno',
                  ativo: 'Acesso ativo',
                  erro: 'Falha ao preparar o acesso',
                }[acessoStatus || ''] || 'Situação ainda não registrada'}
              </p>
              {acessoErro ? (
                <p className="mt-1 text-xs font-semibold text-red-600">{acessoErro}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h4 className="mb-1 text-sm font-bold uppercase tracking-widest text-slate-800">
                  Primeiro acesso e recuperação
                </h4>
                <p className="text-xs font-medium text-slate-500">
                  {email
                    ? 'Envia o convite de primeiro acesso ou, se a conta já existir, um link seguro de recuperação.'
                    : 'Gera um link seguro para o aluno sem e-mail criar a senha de acesso.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => accessMutation.mutate()}
                disabled={accessMutation.isPending}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-900 disabled:opacity-60"
              >
                {accessMutation.isPending && <Loader2 className="animate-spin" size={14} />}
                {email ? 'Enviar acesso' : 'Gerar link de acesso'}
              </button>
            </div>

            {accessHint && (
              <p className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-800">
                {accessHint}
              </p>
            )}

            {recoveryLink && (
              <div className="mt-4 flex gap-3">
                <input
                  type="text"
                  readOnly
                  value={recoveryLink}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600"
                />
                <button
                  type="button"
                  onClick={copyRecoveryLink}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Copy size={14} />
                  Copiar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ParceiroAcesso;

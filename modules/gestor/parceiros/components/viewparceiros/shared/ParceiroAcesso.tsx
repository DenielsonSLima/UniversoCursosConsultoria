import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Unlink2,
  UserRound,
} from 'lucide-react';
import GoogleLogo from '../../../../../shared/auth/GoogleLogo';
import ConfirmModal from '../../../../../shared/components/ConfirmModal';
import { TERMS_VERSION } from '../../../../../shared/constants/terms';
import { portalActivationService } from '../../../portal-activation.service';
import { buildConfiguredAuthRedirectUrl } from '../../../../../../lib/app-url';

type AccessToast = {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
};

interface ParceiroAcessoProps {
  parceiroId: string;
  email?: string | null;
  matriculaAcesso?: string | null;
  tipo?: 'Aluno' | 'Professor';
  acessoStatus?: string | null;
  acessoErro?: string | null;
  trocaSenhaObrigatoria?: boolean | null;
  aceitouTermosUso?: boolean | null;
  termosUsoVersao?: string | null;
  toast?: AccessToast;
}

const ParceiroAcesso: React.FC<ParceiroAcessoProps> = ({
  parceiroId,
  email,
  matriculaAcesso,
  tipo = 'Aluno',
  acessoStatus,
  acessoErro,
  trocaSenhaObrigatoria,
  aceitouTermosUso,
  termosUsoVersao,
  toast,
}) => {
  const queryClient = useQueryClient();
  const [googleHint, setGoogleHint] = useState('');
  const [accessHint, setAccessHint] = useState('');
  const [recoveryLink, setRecoveryLink] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [isIssuingTemporaryPassword, setIsIssuingTemporaryPassword] = useState(false);
  const [isConfirmEmailOpen, setIsConfirmEmailOpen] = useState(false);
  const [isTemporaryPasswordConfirmOpen, setIsTemporaryPasswordConfirmOpen] = useState(false);
  const [isGoogleUnlinkConfirmOpen, setIsGoogleUnlinkConfirmOpen] = useState(false);

  const googleStatusQuery = useQuery({
    queryKey: ['partner-google-identity-status', parceiroId],
    queryFn: () => portalActivationService.getPartnerGoogleIdentityStatus(parceiroId),
    enabled: Boolean(parceiroId),
    staleTime: 15_000,
  });

  const emailConfirmationQuery = useQuery({
    queryKey: ['partner-email-confirmation-status', parceiroId],
    queryFn: async () => {
      const [status] = await portalActivationService.getPartnerEmailStatuses([parceiroId]);
      return status || null;
    },
    enabled: tipo === 'Aluno' && Boolean(parceiroId),
    staleTime: 15_000,
  });

  const googleStatus = googleStatusQuery.data;
  const googleLinked = Boolean(googleStatus?.google_linked);
  const emailConfirmation = emailConfirmationQuery.data;
  const emailConfirmed = Boolean(emailConfirmation?.emailConfirmed);
  const emailValidatedByManager = Boolean(emailConfirmation?.emailValidatedByManager);
  const emailVerifiedForAssistedAccess = emailConfirmed || emailValidatedByManager;
  const termsAreCurrent = aceitouTermosUso === true && termosUsoVersao === TERMS_VERSION;
  const accessIsFullyActive = acessoStatus === 'ativo' && !trocaSenhaObrigatoria && termsAreCurrent;
  const needsFirstAccess = tipo === 'Aluno' && !accessIsFullyActive;
  const canConfirmEmail = Boolean(email) && emailConfirmation?.status === 'pending' && !emailValidatedByManager && needsFirstAccess;
  const canIssueTemporaryPassword = emailVerifiedForAssistedAccess && needsFirstAccess;
  const accessRedirectTo = buildConfiguredAuthRedirectUrl(
    needsFirstAccess ? '/login' : '/recuperar-senha',
  );
  const accessActionLabel = !email
    ? 'Gerar link de primeiro acesso'
    : needsFirstAccess
      ? 'Reenviar primeiro acesso'
      : 'Enviar recuperação de senha';
  const accessDescription = !email
    ? 'Gera um link seguro para o aluno sem e-mail criar a senha de acesso.'
    : needsFirstAccess
      ? 'Reenvia o link para o aluno criar a primeira senha e aceitar os termos.'
      : 'Envia um link seguro para o aluno redefinir a senha de uma conta já ativa.';

  const accessMutation = useMutation({
    mutationFn: () => portalActivationService.ensureStudentAccess({
      partnerId: parceiroId,
      email: email || undefined,
      redirectTo: accessRedirectTo,
    }),
    onMutate: () => {
      setTemporaryPassword('');
    },
    onSuccess: (result) => {
      setTemporaryPassword('');
      setAccessHint(result.message || 'Acesso preparado com sucesso.');
      setRecoveryLink(result.recoveryLink || '');
      queryClient.invalidateQueries({
        queryKey: ['partner-google-identity-status', parceiroId],
      });
      queryClient.invalidateQueries({ queryKey: ['parceiro', parceiroId] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
      queryClient.invalidateQueries({
        queryKey: ['partner-email-confirmation-status', parceiroId],
      });
    },
    onError: (error: any) => {
      setRecoveryLink('');
      setAccessHint(error?.message || 'Não foi possível preparar o acesso do aluno.');
    },
  });

  const confirmEmailMutation = useMutation({
    mutationFn: () => portalActivationService.confirmStudentEmail(parceiroId),
    onSuccess: (result) => {
      setAccessHint(result.message || 'E-mail validado para acesso assistido.');
      toast?.success(
        'E-mail validado',
        'Agora você pode gerar uma senha temporária para o aluno.',
      );
      queryClient.invalidateQueries({
        queryKey: ['partner-email-confirmation-status', parceiroId],
      });
      queryClient.invalidateQueries({ queryKey: ['parceiro', parceiroId] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
    },
    onError: (error: any) => {
      const message = error?.message || 'Não foi possível validar o e-mail do aluno.';
      setAccessHint(message);
      toast?.error('E-mail não validado', message);
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
      toast?.error('Google não desvinculado', message);
    },
  });

  const copyRecoveryLink = async () => {
    if (!recoveryLink) return;
    await navigator.clipboard.writeText(recoveryLink);
    setAccessHint('Link copiado. Envie somente após confirmar a identidade do aluno.');
  };

  const issueTemporaryPassword = async () => {
    if (isIssuingTemporaryPassword) return;
    setIsIssuingTemporaryPassword(true);
    setTemporaryPassword('');
    setRecoveryLink('');

    try {
      const result = await portalActivationService.issueStudentTemporaryPassword(parceiroId);
      if (!result.temporaryPassword) {
        throw new Error('Não foi possível disponibilizar a senha temporária com segurança.');
      }
      setTemporaryPassword(result.temporaryPassword);
      setAccessHint(result.message || 'Senha temporária gerada.');
      toast?.success(
        'Senha temporária gerada',
        'Copie e entregue ao aluno por um canal confirmado. A senha não será exibida novamente.',
      );
      queryClient.invalidateQueries({
        queryKey: ['partner-email-confirmation-status', parceiroId],
      });
      queryClient.invalidateQueries({ queryKey: ['parceiro', parceiroId] });
      queryClient.invalidateQueries({ queryKey: ['parceiros'] });
    } catch (error: any) {
      const message = error?.message || 'Não foi possível gerar a senha temporária.';
      setAccessHint(message);
      toast?.error('Senha temporária não gerada', message);
    } finally {
      setIsIssuingTemporaryPassword(false);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setAccessHint('Senha temporária copiada. Entregue-a somente por um canal confirmado.');
    } catch {
      setAccessHint('Não foi possível copiar automaticamente. Selecione a senha e copie manualmente.');
    }
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
    <>
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
          {tipo === 'Aluno' && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    emailVerifiedForAssistedAccess
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {emailVerifiedForAssistedAccess ? <CheckCircle2 size={18} /> : <ShieldCheck size={18} />}
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Validação administrativa do e-mail
                    </p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                      {emailConfirmationQuery.isLoading
                        ? 'Verificando a confirmação do e-mail...'
                        : emailConfirmed
                          ? 'E-mail confirmado para o acesso do aluno.'
                          : emailValidatedByManager
                            ? 'E-mail validado pelo gestor. A confirmação do login ocorrerá ao gerar a senha temporária.'
                          : emailConfirmation?.status === 'no_auth_user'
                            ? 'Envie ou reenvie o primeiro acesso antes de validar este e-mail.'
                            : emailConfirmation?.status === 'no_email'
                              ? 'Este cadastro não possui e-mail para validar.'
                              : emailConfirmation?.status === 'unknown'
                                ? 'Não foi possível confirmar a situação do e-mail agora.'
                                : 'Use somente se você validou com o aluno que ele controla este endereço.'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConfirmEmailOpen(true)}
                  disabled={!canConfirmEmail || confirmEmailMutation.isPending || emailConfirmationQuery.isLoading}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-5 py-3 text-xs font-bold uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {confirmEmailMutation.isPending && <Loader2 className="animate-spin" size={14} />}
                  {emailConfirmed ? 'E-mail confirmado' : emailValidatedByManager ? 'E-mail validado' : 'Validar e-mail'}
                </button>
              </div>
            </div>
          )}
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
              onClick={() => setIsGoogleUnlinkConfirmOpen(true)}
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
                {trocaSenhaObrigatoria
                  ? 'Primeiro acesso pendente — troca de senha obrigatória'
                  : !termsAreCurrent && acessoStatus === 'ativo'
                    ? 'Termos de uso pendentes — acesso ainda não concluído'
                  : ({
                    sem_acesso: 'Acesso ainda não preparado',
                    pendente: 'Preparação ou envio pendente',
                    processando: 'Preparando acesso',
                    convite_enviado: 'Convite enviado — aguardando o aluno',
                    ativo: 'Acesso ativo',
                    erro: 'Falha ao preparar o acesso',
                  }[acessoStatus || ''] || 'Situação ainda não registrada')}
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
                  {accessDescription}
                </p>
              </div>
              <button
                type="button"
                onClick={() => accessMutation.mutate()}
                disabled={accessMutation.isPending}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-900 disabled:opacity-60"
              >
                {accessMutation.isPending && <Loader2 className="animate-spin" size={14} />}
                {accessActionLabel}
              </button>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="mb-1 text-sm font-bold uppercase tracking-widest text-amber-950">
                    Senha temporária assistida
                  </h4>
                  <p className="text-xs font-medium leading-relaxed text-amber-900">
                    {needsFirstAccess
                      ? 'Disponível apenas após a validação do e-mail. A senha anterior deixa de funcionar e o aluno deverá criar outra no primeiro login.'
                      : 'Este aluno já concluiu o primeiro acesso. Use a recuperação de senha por e-mail quando necessário.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemporaryPasswordConfirmOpen(true)}
                  disabled={!canIssueTemporaryPassword || isIssuingTemporaryPassword || emailConfirmationQuery.isLoading}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isIssuingTemporaryPassword && <Loader2 className="animate-spin" size={14} />}
                  Gerar senha temporária
                </button>
              </div>

              {!emailVerifiedForAssistedAccess && !emailConfirmationQuery.isLoading && (
                <p className="mt-3 text-xs font-semibold text-amber-800">
                  Primeiro confirme que o aluno controla o e-mail cadastrado.
                </p>
              )}

              {temporaryPassword && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wider text-amber-900">
                    Exiba e entregue uma única vez
                  </p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                    Copie esta senha agora. Ao fechar este aviso, ela será removida desta tela; gerar outra invalidará esta.
                  </p>
                  <div className="mt-3 flex gap-3">
                    <input
                      type="text"
                      readOnly
                      autoComplete="off"
                      value={temporaryPassword}
                      className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 font-mono text-sm font-bold tracking-wider text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={() => void copyTemporaryPassword()}
                      className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-3 text-xs font-bold text-amber-800 hover:bg-amber-50"
                    >
                      <Copy size={14} />
                      Copiar
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTemporaryPassword('')}
                    className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-700"
                  >
                    Fechar e apagar desta tela
                  </button>
                </div>
              )}
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

      <ConfirmModal
        isOpen={isConfirmEmailOpen}
        onClose={() => setIsConfirmEmailOpen(false)}
        onConfirm={() => confirmEmailMutation.mutate()}
        title="Validar e-mail"
        message="Use esta opção somente depois de validar, por ligação, mensagem ou presencialmente, que o aluno controla este endereço. A confirmação do login será concluída ao gerar a senha temporária."
        confirmText="Validar e-mail"
        variant="warning"
      />

      <ConfirmModal
        isOpen={isTemporaryPasswordConfirmOpen}
        onClose={() => setIsTemporaryPasswordConfirmOpen(false)}
        onConfirm={() => void issueTemporaryPassword()}
        title="Gerar senha temporária"
        message="A senha atual será invalidada. Copie a nova senha e entregue-a somente pelo canal que você confirmou; o aluno terá de criar outra no primeiro login."
        confirmText="Gerar senha"
        variant="warning"
      />

      <ConfirmModal
        isOpen={isGoogleUnlinkConfirmOpen}
        onClose={() => setIsGoogleUnlinkConfirmOpen(false)}
        onConfirm={() => unlinkGoogleMutation.mutate()}
        title="Desvincular Google"
        message={`Deseja desvincular a conta Google deste ${tipo.toLowerCase()}?`}
        confirmText="Desvincular"
        variant="danger"
      />
    </>
  );
};

export default ParceiroAcesso;

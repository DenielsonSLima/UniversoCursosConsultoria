import React, { useEffect, useState } from 'react';
import {
  Copy,
  KeyRound,
  Loader2,
  MailCheck,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';
import ConfirmModal from '../../../components/ConfirmModal';
import type { ResponsavelLegalDetalhe, ResponsaveisLegaisScope } from '../responsaveis.contract';
import { useResponsavelAccess } from '../hooks/useResponsavelAccess';

type ToastApi = {
  success: (title: string, message: string) => void;
  error: (title: string, message: string) => void;
  info: (title: string, message: string) => void;
};

interface ResponsavelAccessCardProps {
  responsavel: ResponsavelLegalDetalhe;
  scope: ResponsaveisLegaisScope;
  toast: ToastApi;
}

const statusLabel = (status: string) => ({
  confirmed: 'E-mail confirmado',
  pending: 'Confirmação de e-mail pendente',
  no_auth_user: 'Acesso ainda não preparado',
  no_email: 'E-mail não informado',
}[status] || 'Situação informada pelo serviço');

const accessBlockLabel = (reason: string | null) => ({
  STATUS_NAO_ATIVO: 'Ative o cadastro do responsável antes de preparar o acesso.',
  CPF_OBRIGATORIO: 'Informe e verifique o CPF do responsável antes de preparar o acesso.',
  EMAIL_OBRIGATORIO: 'Informe e verifique o e-mail do responsável antes de preparar o acesso.',
  IDENTIDADE_NAO_VERIFICADA: 'Verifique a identidade do responsável antes de preparar o acesso.',
  VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO: 'Confirme ao menos um vínculo vigente antes de preparar o acesso.',
}[reason || ''] || 'Conclua a identidade e um vínculo verificado antes de preparar o acesso.');

const ResponsavelAccessCard: React.FC<ResponsavelAccessCardProps> = ({
  responsavel,
  scope,
  toast,
}) => {
  const canManageAccess = responsavel.canManageGlobal;
  const {
    statusQuery,
    prepareMutation,
    resendMutation,
    confirmEmailMutation,
    temporaryPassword,
    clearTemporaryPassword,
    issueTemporaryPassword,
    isIssuingTemporaryPassword,
  } = useResponsavelAccess(responsavel.id, scope, canManageAccess);
  const [isConfirmEmailOpen, setIsConfirmEmailOpen] = useState(false);
  const [isTemporaryPasswordOpen, setIsTemporaryPasswordOpen] = useState(false);
  const [accessHint, setAccessHint] = useState('');

  useEffect(() => {
    setAccessHint('');
    setIsConfirmEmailOpen(false);
    setIsTemporaryPasswordOpen(false);
  }, [responsavel.id]);

  const status = statusQuery.data;
  const hasLinkedAccess = Boolean(responsavel.authUserId);
  const emailVerified = status?.emailConfirmed === true || status?.emailValidatedByManager === true;
  const firstAccessPending = status?.firstAccessPending;
  const canPrepare = Boolean(canManageAccess && responsavel.eligible && !hasLinkedAccess && status);
  const canResend = Boolean(
    canManageAccess
      && responsavel.eligible
      && hasLinkedAccess
      && firstAccessPending === true,
  );
  const canConfirmEmail = Boolean(
    canManageAccess
      && responsavel.email
      && hasLinkedAccess
      && status?.status === 'pending'
      && !emailVerified
      && firstAccessPending === true,
  );
  const canIssueTemporaryPassword = Boolean(
    canManageAccess
      && responsavel.email
      && hasLinkedAccess
      && emailVerified
      && firstAccessPending === true
      && status?.temporaryPasswordAllowed === true,
  );
  const actionPending = prepareMutation.isPending || resendMutation.isPending;

  const prepareAccess = async () => {
    if (!canManageAccess) return;
    try {
      const result = await prepareMutation.mutateAsync();
      const message = result.message || 'O serviço preparou o acesso do responsável.';
      setAccessHint(message);
      toast.success('Acesso preparado', message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível preparar o acesso.';
      setAccessHint(message);
      toast.error('Acesso não preparado', message);
    }
  };

  const resendAccess = async () => {
    if (!canManageAccess) return;
    try {
      const result = await resendMutation.mutateAsync();
      const message = result.message || 'O novo link de acesso foi enviado.';
      setAccessHint(message);
      toast.success('Acesso reenviado', message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível reenviar o acesso.';
      setAccessHint(message);
      toast.error('Acesso não reenviado', message);
    }
  };

  const confirmEmail = async () => {
    if (!canManageAccess) return;
    try {
      const result = await confirmEmailMutation.mutateAsync();
      const message = result.message || 'E-mail validado para acesso assistido.';
      setAccessHint(message);
      toast.success('E-mail validado', 'Agora é possível gerar uma senha temporária para o responsável.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível validar o e-mail.';
      setAccessHint(message);
      toast.error('E-mail não validado', message);
    }
  };

  const createTemporaryPassword = async () => {
    if (!canManageAccess) return;
    try {
      const result = await issueTemporaryPassword();
      if (!result) return;
      const message = result.message || 'Senha temporária gerada.';
      setAccessHint(message);
      toast.success(
        'Senha temporária gerada',
        'Copie e entregue por um canal confirmado. Ela não será exibida novamente.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível gerar a senha temporária.';
      setAccessHint(message);
      toast.error('Senha temporária não gerada', message);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setAccessHint('Senha temporária copiada. Entregue-a somente pelo canal confirmado.');
    } catch {
      setAccessHint('Não foi possível copiar automaticamente. Selecione e copie a senha manualmente.');
    }
  };

  if (!canManageAccess) {
    return (
      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3 text-amber-900">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-xs font-black">Ações de acesso restritas à Matriz</p>
            <p className="mt-1 text-xs font-medium leading-relaxed">
              A identidade pode estar vinculada a mais de um polo. Somente um Gestor global/Matriz pode preparar, reenviar ou validar este acesso e gerar senha temporária.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!responsavel.eligible) {
    return (
      <div className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
        <div className="flex items-start gap-3 text-amber-800">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-xs font-black">Acesso ainda não liberado</p>
            <p className="mt-1 text-xs font-medium leading-relaxed">
              {accessBlockLabel(responsavel.accessBlockReason)}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm ring-1 ring-emerald-100">
              <KeyRound size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black text-emerald-900">Acesso do responsável</p>
              <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-700">
                O estado abaixo vem do serviço autorizado e é atualizado depois de cada ação.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void statusQuery.refetch()}
            disabled={statusQuery.isFetching}
            aria-label="Atualizar situação do acesso"
            className="rounded-lg bg-white p-2 text-emerald-700 ring-1 ring-emerald-100 hover:bg-emerald-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={statusQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {statusQuery.isPending ? (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-xs font-bold text-slate-500 ring-1 ring-emerald-100">
            <Loader2 size={15} className="animate-spin text-emerald-600" /> Conferindo acesso…
          </div>
        ) : statusQuery.isError || !status ? (
          <div className="mt-4 rounded-xl border border-rose-100 bg-white p-3">
            <p className="text-xs font-black text-rose-700">Situação indisponível</p>
            <p className="mt-1 text-[11px] font-medium text-slate-500">Nenhuma ação sensível é liberada sem a resposta canônica.</p>
            <button type="button" onClick={() => void statusQuery.refetch()} className="mt-2 text-[10px] font-black uppercase tracking-wide text-rose-700 underline">Tentar novamente</button>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Identidade Auth</dt>
                <dd className="mt-1 text-xs font-bold text-slate-700">
                  {hasLinkedAccess
                    ? 'Vinculada'
                    : status.authUserExists === true
                      ? 'Existe, vínculo pendente'
                      : status.authUserExists === false
                        ? 'Não preparada'
                        : 'Situação indisponível'}
                </dd>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">E-mail</dt>
                <dd className="mt-1 text-xs font-bold text-slate-700">{statusLabel(status.status)}</dd>
              </div>
              <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-100">
                <dt className="text-[9px] font-black uppercase tracking-wider text-slate-400">Primeiro acesso</dt>
                <dd className="mt-1 text-xs font-bold text-slate-700">
                  {firstAccessPending === true
                    ? status.requiresPasswordChange === true
                      ? 'Troca de senha pendente'
                      : status.termsAccepted === false
                        ? 'Termos pendentes'
                        : 'Pendente'
                    : firstAccessPending === false
                      ? 'Concluído'
                      : 'Situação indisponível'}
                </dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {!hasLinkedAccess ? (
                <button
                  type="button"
                  onClick={() => void prepareAccess()}
                  disabled={!canPrepare || actionPending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prepareMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <KeyRound size={15} />}
                  Preparar acesso
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void resendAccess()}
                  disabled={!canResend || actionPending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resendMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
                  Reenviar acesso
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsConfirmEmailOpen(true)}
                disabled={!canConfirmEmail || confirmEmailMutation.isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-[10px] font-black uppercase tracking-wide text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirmEmailMutation.isPending ? <Loader2 className="animate-spin" size={15} /> : <MailCheck size={15} />}
                {emailVerified ? 'E-mail validado' : 'Validar e-mail'}
              </button>
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">Senha temporária assistida</p>
                  <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-800">
                    {status.temporaryPasswordAllowed === false
                      ? 'Esta identidade também possui outro perfil. Para não alterar a senha dos demais portais, use a recuperação por e-mail.'
                      : firstAccessPending === false
                        ? 'O primeiro acesso já foi concluído; use a recuperação por e-mail.'
                        : firstAccessPending !== true || status.temporaryPasswordAllowed !== true
                          ? 'A disponibilidade da senha temporária não foi confirmada pelo serviço. Atualize a situação ou use a recuperação por e-mail.'
                          : 'Depois da validação do e-mail, a senha é exibida uma única vez e exige troca no primeiro login.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemporaryPasswordOpen(true)}
                  disabled={!canIssueTemporaryPassword || isIssuingTemporaryPassword}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isIssuingTemporaryPassword ? <Loader2 className="animate-spin" size={15} /> : <KeyRound size={15} />}
                  Gerar senha temporária
                </button>
              </div>

              {temporaryPassword ? (
                <div className="mt-3 rounded-xl border border-amber-200 bg-white p-3">
                  <p className="text-[10px] font-black uppercase tracking-wide text-amber-900">Exiba e entregue uma única vez</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-600">Ao fechar este quadro, a senha será apagada da tela. Gerar outra invalida a anterior.</p>
                  <div className="mt-3 flex gap-2">
                    <input readOnly autoComplete="off" value={temporaryPassword} className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 font-mono text-sm font-bold tracking-wider text-slate-800" />
                    <button type="button" onClick={() => void copyTemporaryPassword()} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 px-3 text-xs font-bold text-amber-800 hover:bg-amber-50"><Copy size={14} /> Copiar</button>
                  </div>
                  <button type="button" onClick={clearTemporaryPassword} className="mt-3 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-slate-800">Fechar e apagar da tela</button>
                </div>
              ) : null}
            </div>

            {accessHint ? <p className="mt-3 rounded-xl border border-blue-100 bg-white px-3 py-2.5 text-xs font-semibold leading-relaxed text-blue-800">{accessHint}</p> : null}
            {!emailVerified && status.authUserExists ? <p className="mt-3 text-[10px] font-bold leading-relaxed text-amber-800">Valide o e-mail apenas depois de confirmar, por ligação, mensagem ou presencialmente, que o responsável controla o endereço cadastrado.</p> : null}
          </>
        )}
      </section>

      <ConfirmModal
        isOpen={isConfirmEmailOpen}
        onClose={() => setIsConfirmEmailOpen(false)}
        onConfirm={() => void confirmEmail()}
        title="Validar e-mail do responsável"
        message="Confirme esta ação somente depois de validar que o responsável controla o endereço cadastrado. Essa decisão ficará registrada pelo serviço."
        confirmText="Validar e-mail"
        variant="warning"
      />
      <ConfirmModal
        isOpen={isTemporaryPasswordOpen}
        onClose={() => setIsTemporaryPasswordOpen(false)}
        onConfirm={() => void createTemporaryPassword()}
        title="Gerar senha temporária"
        message="A senha atual será invalidada. Copie a nova senha e entregue-a somente pelo canal confirmado; o responsável deverá criar outra e aceitar os termos no primeiro login."
        confirmText="Gerar senha"
        variant="warning"
      />
    </>
  );
};

export default ResponsavelAccessCard;

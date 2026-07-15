import React from 'react';
import { BadgeCheck, CircleHelp, CircleX, Loader2, UserRoundX } from 'lucide-react';
import type { PartnerEmailConfirmationStatusValue } from '../../portal-activation.service';

interface EmailConfirmationStatusProps {
  status?: PartnerEmailConfirmationStatusValue;
  isConfirming?: boolean;
  onConfirm?: () => void;
}

const EmailConfirmationStatus: React.FC<EmailConfirmationStatusProps> = ({
  status,
  isConfirming = false,
  onConfirm,
}) => {
  if (!status || status === 'no_email') return null;

  if (status === 'confirmed') {
    return (
      <BadgeCheck
        size={15}
        className="shrink-0 text-emerald-500"
        aria-label="E-mail confirmado"
        title="E-mail confirmado"
      />
    );
  }

  if (status === 'pending') {
    return (
      <button
        type="button"
        disabled={isConfirming || !onConfirm}
        onClick={(event) => {
          event.stopPropagation();
          onConfirm?.();
        }}
        className="shrink-0 rounded-full text-amber-500 transition-colors hover:text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-70"
        aria-label="E-mail não confirmado. Confirmar manualmente"
        title="E-mail não confirmado — clique para confirmar"
      >
        {isConfirming
          ? <Loader2 size={15} className="animate-spin" aria-hidden="true" />
          : <CircleX size={15} aria-hidden="true" />}
      </button>
    );
  }

  if (status === 'unknown') {
    return (
      <CircleHelp
        size={15}
        className="shrink-0 text-slate-400"
        aria-label="Não foi possível verificar a confirmação do e-mail"
        title="Confirmação de e-mail indisponível"
      />
    );
  }

  return (
    <UserRoundX
      size={15}
      className="shrink-0 text-slate-400"
      aria-label="E-mail sem usuário de acesso"
      title="Este e-mail ainda não possui usuário de acesso"
    />
  );
};

export default EmailConfirmationStatus;

import React from 'react';
import { BadgeCheck, CircleHelp, CircleX, UserRoundX } from 'lucide-react';
import type { PartnerEmailConfirmationStatusValue } from '../../portal-activation.service';

interface EmailConfirmationStatusProps {
  status?: PartnerEmailConfirmationStatusValue;
}

const EmailConfirmationStatus: React.FC<EmailConfirmationStatusProps> = ({
  status,
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
      <CircleX
        size={15}
        className="shrink-0 text-amber-500"
        aria-label="Confirmação do e-mail pendente"
        title="Convite pendente — o aluno deve confirmar pelo e-mail recebido"
      />
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
      aria-label="Acesso ainda não criado para este e-mail"
      title="O convite de acesso ainda não foi criado para este e-mail"
    />
  );
};

export default EmailConfirmationStatus;

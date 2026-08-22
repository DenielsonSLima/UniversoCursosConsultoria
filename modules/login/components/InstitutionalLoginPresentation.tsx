import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

export const InstitutionalLoginClock: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const formattedDate = currentTime.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const formattedTime = currentTime.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <>
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-100/90">
        {formattedDate}
      </p>
      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black tabular-nums tracking-widest text-white">
        <Clock size={13} className="text-blue-200" />
        {formattedTime}
      </span>
    </>
  );
};

export const getInstitutionalOAuthErrorMessage = (errorCode: string | null) => {
  if (!errorCode) return null;
  if (errorCode === 'no_profile') {
    return 'Esta conta Google não possui vínculo com nenhum perfil no portal institucional. Entre com e-mail/senha vinculado ou solicite o vínculo no suporte.';
  }
  if (errorCode === 'no_session') {
    return 'Não foi possível recuperar a sessão do Google. Tente novamente.';
  }
  if (errorCode === 'google_error') {
    return 'Não foi possível concluir o login com Google. Tente novamente ou use credenciais de usuário.';
  }
  return null;
};

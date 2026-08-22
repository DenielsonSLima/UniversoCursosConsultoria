import { supabase } from '../../../lib/supabase';

type EmailConfirmationState = {
  email_confirmed_at?: string | null;
};

export const hasConfirmedEmail = (user?: EmailConfirmationState | null) =>
  Boolean(user?.email_confirmed_at);

export const clearUnconfirmedLocalSession = async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    console.warn('Não foi possível limpar a sessão local sem confirmação de e-mail.', error);
  }
};

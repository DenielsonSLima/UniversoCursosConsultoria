import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Link2, Loader2, Unlink2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import GoogleLogo from './GoogleLogo';

const getFriendlyOAuthError = (message: string) => {
  if (message.includes('Manual linking is disabled')) {
    return 'O projeto do Supabase não permite vínculo manual de contas. Ative "Allow manual linking" em Authentication > Settings.';
  }

  if (message.includes('Unsupported provider: provider is not enabled')) {
    return 'Login com Google não está habilitado no projeto do Supabase ainda. Ative em Authentication > Providers > Google e configure CLIENT_ID/CLIENT_SECRET do OAuth.';
  }

  return message;
};

interface GoogleIdentityCardProps {
  tone?: 'blue' | 'purple';
}

const GoogleIdentityCard: React.FC<GoogleIdentityCardProps> = ({ tone = 'blue' }) => {
  const queryClient = useQueryClient();
  const [linkingBlocked, setLinkingBlocked] = React.useState(false);
  const [hint, setHint] = React.useState('');

  const accent = tone === 'purple' ? 'purple' : 'blue';
  const pendingCardClass = accent === 'purple' ? 'border-purple-100 bg-purple-50' : 'border-blue-100 bg-blue-50';
  const pendingIconClass = accent === 'purple' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700';
  const pendingButtonClass = accent === 'purple' ? 'bg-purple-650 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700';

  const { data, isLoading } = useQuery({
    queryKey: ['auth-identities-google'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      return data.identities || [];
    },
  });

  const googleIdentity = data?.find((identity) => identity.provider === 'google');
  const googleLinked = Boolean(googleIdentity);

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      if (!googleIdentity) throw new Error('Nenhuma conta Google vinculada foi localizada.');
      const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
      if (error) throw error;
    },
    onSuccess: () => {
      setHint('Conta Google desvinculada com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['auth-identities-google'] });
    },
    onError: (error: any) => {
      const message = error?.message || 'Não foi possível desvincular a conta Google.';
      setHint(message);
      alert(message);
    },
  });

  const handleLinkGoogle = async () => {
    const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      const friendlyMessage = getFriendlyOAuthError(error.message);
      setHint(friendlyMessage);
      if (error.message.includes('Manual linking is disabled')) {
        setLinkingBlocked(true);
      }
      alert(friendlyMessage);
    }
  };

  return (
    <div className={`rounded-[2rem] border p-5 ${googleLinked ? 'border-emerald-100 bg-emerald-50' : pendingCardClass}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${googleLinked ? 'bg-emerald-100 text-emerald-700' : pendingIconClass}`}>
          {googleLinked ? <CheckCircle2 size={20} /> : <GoogleLogo className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Login com Google</h4>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
            {googleLinked
              ? 'Sua conta Google já está vinculada. Você pode entrar com senha ou Google.'
              : hint || 'Vincule uma conta Google para entrar sem digitar senha nas próximas vezes.'}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={handleLinkGoogle}
          disabled={isLoading || googleLinked || linkingBlocked}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[10px] font-black uppercase tracking-widest text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            googleLinked ? 'bg-emerald-600' : pendingButtonClass
          }`}
        >
          {isLoading ? <Loader2 className="animate-spin" size={14} /> : googleLinked ? <Link2 size={14} /> : <GoogleLogo className="h-4 w-4" />}
          {googleLinked
            ? 'Google vinculado'
            : linkingBlocked
              ? 'Ative manual linking no Supabase'
              : 'Vincular Google'}
        </button>

        {googleLinked && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Deseja desvincular sua conta Google deste acesso?')) {
                unlinkMutation.mutate();
              }
            }}
            disabled={unlinkMutation.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-100 bg-white py-3 text-[10px] font-black uppercase tracking-widest text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {unlinkMutation.isPending ? <Loader2 className="animate-spin" size={14} /> : <Unlink2 size={14} />}
            Desvincular Google
          </button>
        )}
      </div>
    </div>
  );
};

export default GoogleIdentityCard;

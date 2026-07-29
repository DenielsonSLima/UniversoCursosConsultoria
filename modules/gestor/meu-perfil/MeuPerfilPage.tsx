import React from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import ToastNotification, { useToast } from '../components/ToastNotification';
import { loginService } from '../../login/login.service';
import type { PortalAuthProfile } from '../../login/portal-session';
import MeuPerfilAvatarCard from './MeuPerfilAvatarCard';
import { meuPerfilService } from './meu-perfil.service';
import type { MeuPerfilGestorData } from './meu-perfil.types';

interface MeuPerfilPageProps {
  profile: PortalAuthProfile;
  avatarUrl: string | null;
  onProfileUpdated: (profile: MeuPerfilGestorData) => void;
}

type ProfileTab = 'dados' | 'seguranca';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hasStrongPassword = (value: string) => (
  value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value)
);

const maskPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const MeuPerfilPage: React.FC<MeuPerfilPageProps> = ({
  profile,
  avatarUrl,
  onProfileUpdated,
}) => {
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = React.useState<ProfileTab>('dados');
  const [nome, setNome] = React.useState(profile.nome || '');
  const [telefone, setTelefone] = React.useState(maskPhone(profile.telefone || ''));
  const [newEmail, setNewEmail] = React.useState(profile.email || '');
  const [newPassword, setNewPassword] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmation, setShowConfirmation] = React.useState(false);

  React.useEffect(() => {
    setNome(profile.nome || '');
    setTelefone(maskPhone(profile.telefone || ''));
    setNewEmail(profile.email || '');
  }, [profile.email, profile.nome, profile.telefone]);

  const commonProfileFields = React.useCallback(() => ({
    nome: nome.trim() || profile.nome,
    telefone: telefone.trim(),
  }), [nome, profile.nome, telefone]);

  const saveMutation = useMutation({
    mutationFn: () => meuPerfilService.saveProfile({
      ...commonProfileFields(),
      fotoPath: profile.fotoPath || null,
    }),
    onSuccess: (updated) => {
      onProfileUpdated(updated);
      toast.success('Perfil atualizado', 'Seus dados pessoais foram salvos com sucesso.', {
        avatarUrl,
        avatarName: updated.nome,
        contextLabel: 'Meu Perfil',
      });
    },
    onError: (error) => {
      toast.error('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.', {
        avatarUrl,
        avatarName: nome,
        contextLabel: 'Meu Perfil',
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => meuPerfilService.uploadAvatar(file, profile.fotoPath),
    onSuccess: (updated) => {
      onProfileUpdated(updated);
      toast.success('Foto atualizada', 'Sua nova foto de perfil já foi salva.', {
        avatarName: updated.nome,
        contextLabel: 'Meu Perfil',
      });
    },
    onError: (error) => {
      toast.error('Foto não atualizada', error instanceof Error ? error.message : 'Tente outra imagem.', {
        avatarUrl,
        avatarName: nome,
        contextLabel: 'Meu Perfil',
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => meuPerfilService.removeAvatar(profile.fotoPath),
    onSuccess: (updated) => {
      onProfileUpdated(updated);
      toast.success('Foto removida', 'O perfil voltou a usar suas iniciais.', {
        avatarName: updated.nome,
        contextLabel: 'Meu Perfil',
      });
    },
    onError: (error) => {
      toast.error('Foto não removida', error instanceof Error ? error.message : 'Tente novamente.', {
        avatarUrl,
        avatarName: nome,
        contextLabel: 'Meu Perfil',
      });
    },
  });

  const emailMutation = useMutation({
    mutationFn: () => meuPerfilService.requestEmailUpdate(newEmail),
    onSuccess: (result) => {
      if (!result.pendingConfirmation) {
        onProfileUpdated({
          id: profile.id,
          nome: profile.nome,
          email: result.email,
          telefone: profile.telefone || null,
          fotoPath: profile.fotoPath || null,
        });
      }
      toast.success(
        result.pendingConfirmation ? 'Confirme o novo e-mail' : 'E-mail atualizado',
        result.pendingConfirmation
          ? 'Enviamos as instruções de confirmação. O e-mail atual continuará válido até a confirmação.'
          : 'Seu novo e-mail de acesso já está ativo.',
        {
          avatarUrl,
          avatarName: profile.nome,
          contextLabel: 'Segurança da conta',
        },
      );
    },
    onError: (error) => {
      toast.error(
        'E-mail não alterado',
        error instanceof Error ? error.message : 'Confira o endereço e tente novamente.',
        {
          avatarUrl,
          avatarName: profile.nome,
          contextLabel: 'Segurança da conta',
        },
      );
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const reauthenticationError = await loginService.reauthenticateWithPassword(currentPassword);
      if (reauthenticationError) throw new Error(reauthenticationError);
      const error = await loginService.updatePassword(newPassword);
      if (error) throw new Error(error);
    },
    onSuccess: () => {
      setNewPassword('');
      setConfirmPassword('');
      setCurrentPassword('');
      toast.success('Senha atualizada', 'Use a nova senha no próximo acesso.', {
        avatarUrl,
        avatarName: profile.nome,
        contextLabel: 'Segurança da conta',
      });
    },
    onError: (error) => {
      toast.error(
        'Senha não alterada',
        error instanceof Error ? error.message : 'Tente novamente.',
        {
          avatarUrl,
          avatarName: profile.nome,
          contextLabel: 'Segurança da conta',
        },
      );
    },
  });

  const submitProfile = (event: React.FormEvent) => {
    event.preventDefault();
    if (nome.trim().length < 3) {
      toast.error('Nome incompleto', 'Informe pelo menos 3 caracteres.');
      return;
    }
    if (telefone.replace(/\D/g, '').length !== 11) {
      toast.error('Celular inválido', 'Informe os 11 dígitos, incluindo o DDD.');
      return;
    }
    saveMutation.mutate();
  };

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      toast.error('E-mail inválido', 'Informe um endereço de e-mail válido.');
      return;
    }
    if (normalizedEmail === profile.email.trim().toLowerCase()) {
      toast.info('Nenhuma alteração', 'Este já é o e-mail atual da sua conta.');
      return;
    }
    emailMutation.mutate();
  };

  const submitPassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      toast.error('Confirme sua identidade', 'Digite sua senha atual antes de criar uma nova.');
      return;
    }
    if (!hasStrongPassword(newPassword)) {
      toast.error(
        'Senha fora do padrão',
        'Use 6 ou mais caracteres, com letra maiúscula, minúscula e número.',
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não conferem', 'Digite a mesma senha nos dois campos.');
      return;
    }
    passwordMutation.mutate();
  };

  const tabs: Array<{ id: ProfileTab; label: string; icon: React.ReactNode }> = [
    { id: 'dados', label: 'Dados pessoais', icon: <UserRound size={16} /> },
    { id: 'seguranca', label: 'Segurança e acesso', icon: <ShieldCheck size={16} /> },
  ];
  const profileMutationPending = saveMutation.isPending
    || uploadMutation.isPending
    || removeMutation.isPending;
  const securityMutationPending = emailMutation.isPending || passwordMutation.isPending;

  return (
    <div className="animate-fadeIn space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-[#001a33] text-white shadow-xl shadow-slate-900/10">
        <div className="relative px-6 py-7 md:px-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">
                <BadgeCheck size={16} />
                Área pessoal
              </div>
              <h1 className="mt-2 text-2xl font-black uppercase tracking-tight md:text-3xl">Meu Perfil</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">
                Mantenha seus dados de contato, foto e formas de acesso sempre atualizados.
                Esta área é pessoal e independente das Configurações administrativas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-100">
                <Building2 size={14} />
                Portal Gestor
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-200">
                <LockKeyhole size={14} />
                Acesso privado
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition sm:flex-none ${
              activeTab === tab.id
                ? 'bg-[#001a33] text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-[#001a33]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dados' ? (
        <div className="grid gap-6 xl:grid-cols-[19rem_minmax(0,1fr)]">
          <MeuPerfilAvatarCard
            name={nome || profile.nome}
            avatarUrl={avatarUrl}
            isUploading={uploadMutation.isPending}
            isRemoving={removeMutation.isPending}
            disabled={profileMutationPending}
            onUpload={(file) => uploadMutation.mutateAsync(file)}
            onRemove={() => removeMutation.mutateAsync()}
          />

          <form onSubmit={submitProfile} className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm md:p-7">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-[#001a33]">Informações pessoais</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Estes dados identificam você dentro do sistema.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-emerald-700">
                <CheckCircle2 size={14} />
                Conta ativa
              </span>
            </div>

            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <UserRound size={14} />
                  Nome completo
                </span>
                <input
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  maxLength={120}
                  autoComplete="name"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  placeholder="Seu nome completo"
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <Phone size={14} />
                  Telefone
                </span>
                <input
                  type="tel"
                  value={telefone}
                  onChange={(event) => setTelefone(maskPhone(event.target.value))}
                  maxLength={16}
                  autoComplete="tel"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                  placeholder="(79) 99999-9999"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <Mail size={14} />
                  E-mail de acesso
                </span>
                <input
                  type="email"
                  value={profile.email}
                  readOnly
                  className="h-12 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 text-sm font-bold text-slate-500 outline-none"
                />
                <span className="block text-[10px] font-semibold text-slate-400">
                  Para trocar o e-mail, use a aba Segurança e acesso.
                </span>
              </label>
            </div>

            <div className="mt-7 flex justify-end border-t border-slate-100 pt-5">
              <button
                type="submit"
                disabled={profileMutationPending}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-slate-900/10 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saveMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <form onSubmit={submitEmail} className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm md:p-7">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Mail size={20} />
              </div>
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-[#001a33]">Alterar e-mail</h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                  O novo endereço será usado para entrar no portal.
                </p>
              </div>
            </div>

            <label className="mt-6 block space-y-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Novo e-mail de acesso</span>
              <input
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                autoComplete="email"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
                placeholder="novoemail@exemplo.com"
                required
              />
            </label>

            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[11px] font-semibold leading-relaxed text-amber-800">
              Por segurança, o Supabase poderá solicitar confirmação no e-mail atual e no novo.
              Até a conclusão, continue entrando com <strong>{profile.email}</strong>.
            </div>

            <button
              type="submit"
              disabled={securityMutationPending}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {emailMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
              {emailMutation.isPending ? 'Solicitando...' : 'Alterar e-mail'}
            </button>
          </form>

          <form onSubmit={submitPassword} className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm md:p-7">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                <KeyRound size={20} />
              </div>
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-[#001a33]">Alterar senha</h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                  Crie uma senha forte e exclusiva para este acesso.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Senha atual</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  placeholder="Confirme sua senha atual"
                  required
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Nova senha</span>
                <span className="relative block">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    placeholder="Nova senha"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((current) => !current)}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
                    aria-label={showNewPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>

              <label className="space-y-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Confirmar nova senha</span>
                <span className="relative block">
                  <input
                    type={showConfirmation ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 pr-12 text-sm font-bold text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    placeholder="Repita a senha"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmation((current) => !current)}
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
                    aria-label={showConfirmation ? 'Ocultar confirmação da senha' : 'Mostrar confirmação da senha'}
                  >
                    {showConfirmation ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
              </label>
              </div>
            </div>

            <div className={`mt-4 rounded-2xl border px-4 py-3 text-[11px] font-semibold ${
              hasStrongPassword(newPassword)
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-slate-50 text-slate-600'
            }`}>
              Mínimo de 8 caracteres, com letra maiúscula, minúscula e número.
            </div>

            <button
              type="submit"
              disabled={securityMutationPending}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {passwordMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {passwordMutation.isPending ? 'Alterando...' : 'Alterar senha'}
            </button>
          </form>

        </div>
      )}

      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default MeuPerfilPage;

import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, KeyRound, Link2, Loader2, User } from 'lucide-react';
import { parceirosService } from '../../gestor/parceiros/parceiros.service';
import GoogleIdentityCard from '../../shared/auth/GoogleIdentityCard';
import { loginService } from '../../login/login.service';
import ToastNotification, { useToast } from '../../gestor/components/ToastNotification';
import ProfessorSignaturePanel from './ProfessorSignaturePanel';
import ProfessorProfileData from './ProfessorProfileData';
import ProfessorProfileSecurity from './ProfessorProfileSecurity';
import { professorPasswordError, professorProfileForm, type ProfessorProfileForm } from './professor-profile.model';
import { useProfessorProfileRealtime } from './useProfessorProfileRealtime';
import '../components/professor-screens.css';

interface PerfilPageProps { professorId: string; }
type PerfilTab = 'dados' | 'assinatura' | 'seguranca' | 'google';
const tabs: { id: PerfilTab; label: string; icon: React.ReactNode }[] = [
  { id: 'dados', label: 'Dados e pagamento', icon: <User size={15} /> },
  { id: 'assinatura', label: 'Minha assinatura', icon: <FileSignature size={15} /> },
  { id: 'seguranca', label: 'Segurança', icon: <KeyRound size={15} /> },
  { id: 'google', label: 'Conta Google', icon: <Link2 size={15} /> },
];

const PerfilPage: React.FC<PerfilPageProps> = ({ professorId }) => {
  const client = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const [activeTab, setActiveTab] = useState<PerfilTab>('dados');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => professorProfileForm());
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const profileSaving = useRef(false);
  const passwordSaving = useRef(false);
  useProfessorProfileRealtime(professorId);
  const profileQuery = useQuery({
    queryKey: ['professor-perfil', professorId],
    queryFn: () => parceirosService.getById(professorId),
    enabled: Boolean(professorId),
    refetchOnReconnect: 'always',
  });
  const profile = profileQuery.data;
  useEffect(() => {
    if (!editing && profile) setForm(professorProfileForm(profile));
  }, [editing, profile]);
  useEffect(() => {
    setEditing(false);
    setPassword('');
    setConfirmation('');
    setPasswordMessage(null);
  }, [professorId]);

  const updateProfile = useMutation({
    mutationFn: async (values: ProfessorProfileForm) => {
      const { email, cpf, cnpj, nome, nomeCompleto, ...editableProfile } = profile || {};
      void email; void cpf; void cnpj; void nome; void nomeCompleto;
      return parceirosService.update(professorId, { ...editableProfile, ...values, contato1: values.telefone });
    },
    onSuccess: async (updated) => {
      client.setQueryData(['professor-perfil', professorId], updated);
      setEditing(false);
      await client.invalidateQueries({ queryKey: ['professor-perfil', professorId], exact: true });
      toast.success('Professor atualizado', 'Cadastro e dados de pagamento foram salvos com sucesso.', {
        avatarUrl: updated?.foto || profile?.foto,
        avatarName: updated?.nomeCompleto || updated?.nome || profile?.nome,
        contextLabel: 'Meu perfil de professor',
      });
    },
    onError: (error) => toast.error('Cadastro não atualizado', error instanceof Error ? error.message : 'Revise os dados e tente novamente.', {
      avatarUrl: profile?.foto, avatarName: profile?.nomeCompleto || profile?.nome, contextLabel: 'Meu perfil de professor',
    }),
    onSettled: () => { profileSaving.current = false; },
  });
  const updatePassword = useMutation({
    mutationFn: async () => {
      const error = await loginService.updatePassword(password);
      if (error) throw new Error(error);
    },
    onSuccess: () => { setPassword(''); setConfirmation(''); setPasswordMessage({ tone: 'success', text: 'Senha alterada com sucesso.' }); },
    onError: (error) => setPasswordMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Não foi possível alterar a senha.' }),
    onSettled: () => { passwordSaving.current = false; },
  });
  const saveProfile = (event: React.FormEvent) => {
    event.preventDefault();
    if (profileSaving.current || !editing) return;
    profileSaving.current = true;
    updateProfile.mutate(form);
  };
  const savePassword = (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordSaving.current) return;
    const error = professorPasswordError(password, confirmation);
    setPasswordMessage(error ? { tone: 'error', text: error } : null);
    if (error) return;
    passwordSaving.current = true;
    updatePassword.mutate();
  };

  return (
    <div className="professor-screen">
      <section className="professor-card">
        <div className="professor-heading"><div><h2>Meu perfil</h2><p>Dados cadastrais, assinatura, segurança e login social.</p></div></div>
        <nav className="professor-tabs" role="tablist" aria-label="Seções do perfil">
          {tabs.map(({ id, label, icon }) => (
            <button
              type="button" role="tab" key={id} id={`profile-tab-${id}`}
              aria-selected={activeTab === id} aria-controls={`profile-panel-${id}`}
              disabled={updateProfile.isPending || updatePassword.isPending}
              onClick={() => setActiveTab(id)}
            >
              {icon}{label}
            </button>
          ))}
        </nav>
        {profileQuery.isPending ? (
          <p role="status" className="flex items-center gap-2 py-8 professor-help"><Loader2 size={16} className="animate-spin" />Carregando perfil…</p>
        ) : profileQuery.isError || !profile ? (
          <p role="alert" className="py-6 text-red-800">Não foi possível carregar seu cadastro. A consulta será retomada automaticamente ao reconectar.</p>
        ) : (
          <div role="tabpanel" id={`profile-panel-${activeTab}`} aria-labelledby={`profile-tab-${activeTab}`}>
            {activeTab === 'dados' && (
              <ProfessorProfileData
                profile={profile} values={form} editing={editing} busy={updateProfile.isPending}
                onField={(key, value) => setForm((previous) => ({ ...previous, [key]: value }))}
                onEdit={() => { setForm(professorProfileForm(profile)); setEditing(true); }}
                onCancel={() => { setForm(professorProfileForm(profile)); setEditing(false); }}
                onSubmit={saveProfile}
              />
            )}
            {activeTab === 'assinatura' && <ProfessorSignaturePanel professorId={professorId} professorName={profile.nomeCompleto || profile.nome || 'Professor(a)'} />}
            {activeTab === 'seguranca' && (
              <ProfessorProfileSecurity
                email={profile.email} password={password} confirmation={confirmation}
                busy={updatePassword.isPending} message={passwordMessage}
                onPassword={setPassword} onConfirmation={setConfirmation} onSubmit={savePassword}
              />
            )}
            {activeTab === 'google' && (
              <section className="pt-5">
                <div className="professor-heading">
                  <div><h3>Conta Google</h3><p>Vincule ou remova uma conta Google para facilitar o acesso ao portal.</p></div>
                </div>
                <GoogleIdentityCard tone="blue" />
              </section>
            )}
          </div>
        )}
      </section>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
export default PerfilPage;

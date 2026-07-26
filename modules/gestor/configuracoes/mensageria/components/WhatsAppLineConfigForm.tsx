import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppWindow,
  AlertCircle,
  Braces,
  CheckCircle2,
  Cloud,
  CreditCard,
  ExternalLink,
  Hash,
  KeyRound,
  Loader2,
  LockKeyhole,
  Pencil,
  Phone,
  QrCode,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  Trash2,
  Webhook,
  XCircle,
} from 'lucide-react';
import type { WhatsAppConexao } from '../../../comunicacao/components/whatsapp/whatsapp.types';
import { whatsappService } from '../../../comunicacao/components/whatsapp/whatsapp.service';
import { mensageriaService } from '../mensageria.service';
import { loadFacebookSdk, facebookWindow } from './whatsapp-coexistence/facebookSdk';
import {
  embeddedSignupErrorMessage,
  isTrustedFacebookOrigin,
  parseSessionPayload,
} from './whatsapp-coexistence/sessionPayload';
import { COEXISTENCE_FINISH_EVENT } from './whatsapp-coexistence/constants';

type ConnectionSaveInput = Partial<WhatsAppConexao> & {
  tokenInput?: string;
  appSecretInput?: string;
  verifyTokenInput?: string;
};

type SecretKind = 'access_token' | 'app_secret' | 'verify_token';
type CredentialKey = 'accessToken' | 'appSecret' | 'verifyToken';
type CredentialCheck = {
  state: 'valid' | 'verified' | 'stored' | 'missing' | 'invalid';
  message: string;
};

interface WhatsAppLineConfigFormProps {
  conexao: WhatsAppConexao;
  onSave: (data: ConnectionSaveInput) => Promise<void>;
  isSaving: boolean;
  onNameChange?: (name: string) => void;
}

const Field = ({
  icon: Icon,
  label,
  children,
  span = false,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) => (
  <label className={`flex flex-col gap-1.5 ${span ? 'md:col-span-2' : ''}`}>
    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
      <Icon size={13} />
      {label}
    </span>
    {children}
  </label>
);

const inputClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10';

const selectClass = `${inputClass} cursor-pointer`;

const INST_COLORS: Record<string, string> = {
  universo: 'bg-emerald-600',
  anhanguera: 'bg-blue-600',
  unopar: 'bg-violet-600',
};

const StatusPill = ({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
      ready ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
    }`}
  >
    {ready ? <CheckCircle2 size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
    {children}
  </span>
);

const credentialStateStyles: Record<CredentialCheck['state'], string> = {
  valid: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stored: 'border-blue-200 bg-blue-50 text-blue-700',
  missing: 'border-slate-200 bg-slate-50 text-slate-500',
  invalid: 'border-red-200 bg-red-50 text-red-700',
};

const credentialStateLabels: Record<CredentialCheck['state'], string> = {
  valid: 'Válido',
  verified: 'Confirmado',
  stored: 'Salvo no cofre',
  missing: 'Não configurado',
  invalid: 'Inválido',
};

const CredentialField = ({
  id,
  icon: Icon,
  label,
  configured,
  check,
  value,
  onChange,
  onRemove,
  isRemoving,
  placeholder,
  span = false,
  managedByLogin = false,
}: {
  id: string;
  icon: React.ElementType;
  label: string;
  configured: boolean;
  check?: CredentialCheck;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  isRemoving: boolean;
  placeholder: string;
  span?: boolean;
  managedByLogin?: boolean;
}) => {
  const state = check?.state ?? (configured ? 'stored' : 'missing');
  const description = check?.message ?? (managedByLogin
    ? configured
      ? 'Token obtido pelo login da Meta e protegido no cofre.'
      : 'Será criado automaticamente ao concluir o login com Facebook.'
    : configured
    ? 'A credencial está protegida no cofre. O valor não é exibido por segurança.'
    : 'Nenhuma credencial foi salva para esta linha.');

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 ${span ? 'md:col-span-2' : ''}`}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Icon size={13} />
            {label}
          </span>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-400">{description}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-bold ${credentialStateStyles[state]}`}>
          {state === 'invalid' ? <AlertCircle size={11} /> : state === 'missing' ? <LockKeyhole size={11} /> : <CheckCircle2 size={11} />}
          {credentialStateLabels[state]}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {managedByLogin ? (
          <div className="flex h-11 flex-1 items-center rounded-lg border border-dashed border-slate-200 bg-white px-3.5 text-xs text-slate-500">
            {configured ? '••••••••  Gerenciado pelo login da Meta' : 'Conclua “Entrar com Facebook” para gerar'}
          </div>
        ) : (
          <input
            id={id}
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
            placeholder={configured ? 'Digite uma nova credencial para substituir' : placeholder}
            autoComplete="new-password"
            aria-label={configured ? `Nova credencial para ${label}` : label}
          />
        )}
        {configured ? (
          <div className="flex shrink-0 gap-2">
            {!managedByLogin ? (
              <button
                type="button"
                onClick={() => document.getElementById(id)?.focus()}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700"
              >
                <Pencil size={13} />
                Alterar
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemove}
              disabled={isRemoving}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {isRemoving ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Remover
            </button>
          </div>
        ) : null}
      </div>
      {value && !managedByLogin ? (
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          Nova credencial pronta para salvar. O valor atual só será substituído ao clicar em Salvar.
        </p>
      ) : null}
    </div>
  );
};

export const WhatsAppLineConfigForm: React.FC<WhatsAppLineConfigFormProps> = ({
  conexao,
  onSave,
  isSaving,
  onNameChange,
}) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Partial<WhatsAppConexao>>({});
  const [tokenInput, setTokenInput] = useState('');
  const [appSecretInput, setAppSecretInput] = useState('');
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [credentialChecks, setCredentialChecks] = useState<
    Partial<Record<CredentialKey, CredentialCheck>>
  >({});
  const [isTestingCredentials, setIsTestingCredentials] = useState(false);
  const [removingSecret, setRemovingSecret] = useState<SecretKind | null>(null);
  const [credentialActionError, setCredentialActionError] = useState<string | null>(null);
  const [credentialActionSuccess, setCredentialActionSuccess] = useState<string | null>(null);
  const [credentialActionTone, setCredentialActionTone] = useState<'success' | 'warning'>('success');
  const [lastCredentialCheckAt, setLastCredentialCheckAt] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [coexResult, setCoexResult] = useState<{
    wabaId?: string | null;
    phoneNumberId?: string | null;
    displayPhoneNumber?: string | null;
    warnings?: string[];
  } | null>(null);
  const [coexError, setCoexError] = useState<string | null>(null);

  useEffect(() => {
    setDraft({
      id: conexao.id,
      nome: conexao.nome,
      instituicao: conexao.instituicao,
      telefone: conexao.telefone || '',
      phone_number_id: conexao.phone_number_id || '',
      waba_id: conexao.waba_id || '',
      is_default: conexao.is_default,
      is_matriz_financeira: conexao.is_matriz_financeira,
      status: conexao.status || 'ativo',
      connection_mode: conexao.connection_mode || 'cloud_api',
      graph_version: conexao.graph_version || 'v25.0',
      app_id: conexao.app_id || '',
      embedded_signup_config_id: conexao.embedded_signup_config_id || '',
    });
    setTokenInput('');
    setAppSecretInput('');
    setVerifyTokenInput('');
    setCredentialChecks({});
    setCredentialActionError(null);
    setCredentialActionSuccess(null);
    setCredentialActionTone('success');
    setLastCredentialCheckAt(conexao.last_health_check_at || null);
    setCoexResult(null);
    setCoexError(null);
  }, [conexao.id, conexao.updated_at]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave({
      ...draft,
      tokenInput: tokenInput.trim() || undefined,
      appSecretInput: appSecretInput.trim() || undefined,
      verifyTokenInput: verifyTokenInput.trim() || undefined,
    });
    setTokenInput('');
    setAppSecretInput('');
    setVerifyTokenInput('');
    setCredentialChecks({});
    setCredentialActionError(null);
    setCredentialActionSuccess('Alterações salvas. As credenciais permanecem ocultas e protegidas no cofre.');
    setCredentialActionTone('success');
  };

  const handleTestCredentials = async () => {
    const connectionId = String(draft.id || '').trim();
    if (!connectionId) {
      setCredentialActionError('Salve a linha antes de testar as credenciais.');
      return;
    }
    setIsTestingCredentials(true);
    setCredentialActionError(null);
    setCredentialActionSuccess(null);
    try {
      const result = await whatsappService.validateConexaoCredentials(connectionId);
      setCredentialChecks(result.credentials);
      setLastCredentialCheckAt(result.checkedAt);
      setCredentialActionSuccess(
        result.ok
          ? 'Teste concluído. Veja o estado individual de cada credencial.'
          : 'Teste concluído com credenciais que precisam de atenção.',
      );
      setCredentialActionTone(result.ok ? 'success' : 'warning');
      await queryClient.invalidateQueries({ queryKey: ['whatsapp_conexoes'] });
    } catch (error) {
      setCredentialActionError(
        error instanceof Error ? error.message : 'Não foi possível testar as credenciais.',
      );
    } finally {
      setIsTestingCredentials(false);
    }
  };

  const handleRemoveSecret = async (kind: SecretKind, label: string) => {
    const connectionId = String(draft.id || '').trim();
    if (!connectionId) return;
    if (!window.confirm(`Remover ${label} desta linha? A conexão ficará inativa até uma nova credencial ser salva.`)) {
      return;
    }

    setRemovingSecret(kind);
    setCredentialActionError(null);
    setCredentialActionSuccess(null);
    try {
      await whatsappService.removeConexaoSecret(connectionId, kind);
      if (kind === 'access_token') setTokenInput('');
      if (kind === 'app_secret') setAppSecretInput('');
      if (kind === 'verify_token') setVerifyTokenInput('');
      setCredentialChecks({});
      setLastCredentialCheckAt(null);
      setCredentialActionSuccess(`${label} removido do cofre com segurança.`);
      setCredentialActionTone('success');
      await queryClient.invalidateQueries({ queryKey: ['whatsapp_conexoes'] });
    } catch (error) {
      setCredentialActionError(
        error instanceof Error ? error.message : `Não foi possível remover ${label}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['whatsapp_conexoes'] });
    } finally {
      setRemovingSecret(null);
    }
  };

  const handleFacebookLogin = async () => {
    const connectionId = String(draft.id || '').trim();
    const appId = String(draft.app_id || '').trim();
    const configurationId = String(draft.embedded_signup_config_id || '').trim();
    const graphVersion = String(draft.graph_version || 'v25.0').trim();

    if (!connectionId) {
      setCoexError('Salve a nova linha antes de iniciar o login com a Meta.');
      return;
    }
    if (!appId || !configurationId) {
      setCoexError('Informe o App ID e o Configuration ID do Embedded Signup.');
      return;
    }
    if (!appSecretInput.trim() && !conexao.app_secret_configured) {
      setCoexError('Informe o App Secret para trocar o código de autorização com segurança.');
      return;
    }
    if (!verifyTokenInput.trim() && !conexao.verify_token_configured) {
      setCoexError('Informe o Verify Token que será usado na validação do webhook.');
      return;
    }

    setIsLaunching(true);
    setCoexError(null);
    setCoexResult(null);

    let latestCode: string | null = null;
    let latestSessionEvent: Record<string, unknown> | null = null;
    let completionStarted = false;

    const cleanup = () => window.removeEventListener('message', messageHandler);

    const tryComplete = async () => {
      if (!latestCode || !latestSessionEvent || completionStarted) return;
      completionStarted = true;

      try {
        const result = await mensageriaService.completeWhatsAppEmbeddedSignup({
          connectionId,
          code: latestCode,
          mode: 'coexistence',
          appId,
          appSecret: appSecretInput.trim() || undefined,
          verifyToken: verifyTokenInput.trim() || undefined,
          graphVersion,
          configurationId,
          sessionEvent: latestSessionEvent,
        });
        if (!result.coexistenceVerified) {
          throw new Error('A Meta concluiu o login, mas não confirmou a coexistência deste número.');
        }

        setDraft((current) => ({
          ...current,
          waba_id: result.wabaId || current.waba_id,
          phone_number_id: result.phoneNumberId || current.phone_number_id,
          telefone: result.displayPhoneNumber || current.telefone,
        }));
        setCoexResult(result);
        setAppSecretInput('');
        setVerifyTokenInput('');
        await queryClient.invalidateQueries({ queryKey: ['whatsapp_conexoes'] });
      } catch (error) {
        completionStarted = false;
        setCoexError(error instanceof Error ? error.message : 'Não foi possível concluir a coexistência.');
      } finally {
        setIsLaunching(false);
        cleanup();
      }
    };

    // eslint-disable-next-line no-undef
    const messageHandler = (event: MessageEvent) => {
      if (!isTrustedFacebookOrigin(event.origin)) return;
      const payload = parseSessionPayload(event.data);
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;

      if (payload.event === 'CANCEL' || payload.event === 'ERROR') {
        setCoexError(embeddedSignupErrorMessage(payload));
        setIsLaunching(false);
        cleanup();
        return;
      }
      if (payload.event === 'FINISH') {
        setCoexError('A Meta abriu o fluxo padrão, não o fluxo de coexistência. Revise o Configuration ID.');
        setIsLaunching(false);
        cleanup();
        return;
      }
      if (payload.event !== COEXISTENCE_FINISH_EVENT) return;

      latestSessionEvent = payload;
      void tryComplete();
    };

    window.addEventListener('message', messageHandler);

    try {
      await loadFacebookSdk(appId, graphVersion);
      const facebookSdk = facebookWindow().FB;
      if (!facebookSdk) throw new Error('O SDK do Facebook não ficou disponível.');

      facebookSdk.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setCoexError(embeddedSignupErrorMessage(response));
          setIsLaunching(false);
          cleanup();
          return;
        }
        latestCode = code;
        void tryComplete();
      }, {
        config_id: configurationId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: 'whatsapp_business_app_onboarding',
          sessionInfoVersion: '3',
        },
      });
    } catch (error) {
      setIsLaunching(false);
      setCoexError(error instanceof Error ? error.message : 'Erro ao carregar o SDK do Facebook.');
      cleanup();
    }
  };

  const isCoexistence = draft.connection_mode === 'coexistence';
  const bgColor = INST_COLORS[draft.instituicao || 'universo'] || 'bg-slate-500';

  return (
    <form onSubmit={handleSubmit} className="animate-fadeIn overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${bgColor}`}>
            <Smartphone size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">{draft.nome || 'Nova Linha'}</h4>
            <p className="text-xs text-slate-400">Identidade, credenciais e conexão oficial com a Meta.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusPill ready={Boolean(conexao.token_configured)}>Access Token salvo</StatusPill>
          {isCoexistence ? (
            <>
              <StatusPill ready={Boolean(conexao.app_secret_configured)}>App Secret</StatusPill>
              <StatusPill ready={Boolean(conexao.verify_token_configured)}>Verify Token</StatusPill>
            </>
          ) : null}
          {isCoexistence || conexao.waba_id || conexao.waba_subscribed_at ? (
            <StatusPill ready={Boolean(conexao.waba_subscribed_at)}>Webhook WABA</StatusPill>
          ) : null}
          {isCoexistence || conexao.webhook_verified_at ? (
            <StatusPill ready={Boolean(conexao.webhook_verified_at)}>Webhook</StatusPill>
          ) : null}
          <button
            type="submit"
            disabled={isSaving}
            className="ml-1 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 border-b border-slate-100 px-5 py-5 md:grid-cols-2">
        <Field icon={Smartphone} label="Nome da linha">
          <input
            value={draft.nome || ''}
            onChange={(event) => {
              setDraft((current) => ({ ...current, nome: event.target.value }));
              onNameChange?.(event.target.value);
            }}
            className={inputClass}
            placeholder="Ex.: Universo Principal"
          />
        </Field>
        <Field icon={Phone} label="Número exibido">
          <input
            value={draft.telefone || ''}
            onChange={(event) => setDraft((current) => ({ ...current, telefone: event.target.value }))}
            className={inputClass}
            placeholder="+55 79 99999-9999"
          />
        </Field>
        <Field icon={CreditCard} label="Função da linha">
          <select
            value={draft.is_matriz_financeira ? 'true' : 'false'}
            onChange={(event) => setDraft((current) => ({
              ...current,
              is_matriz_financeira: event.target.value === 'true',
            }))}
            className={selectClass}
          >
            <option value="true">Matriz financeira principal</option>
            <option value="false">Atendimento geral</option>
          </select>
        </Field>
        <Field icon={CheckCircle2} label="Operação">
          <select
            value={draft.status || 'ativo'}
            onChange={(event) => setDraft((current) => ({
              ...current,
              status: event.target.value as 'ativo' | 'inativo',
            }))}
            className={selectClass}
          >
            <option value="ativo">Linha ativa</option>
            <option value="inativo">Linha inativa</option>
          </select>
        </Field>
      </section>

      <section className="border-b border-slate-100 px-5 py-5">
        <p className="mb-3 text-xs font-semibold text-slate-500">Modo de conexão</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setDraft((current) => ({ ...current, connection_mode: 'cloud_api' }))}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              !isCoexistence
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <Cloud size={18} className={!isCoexistence ? 'mt-0.5 text-emerald-600' : 'mt-0.5 text-slate-400'} />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Cloud API exclusiva</span>
              <span className="mt-0.5 block text-xs text-slate-500">Número dedicado à API, sem uso no aplicativo do celular.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDraft((current) => ({ ...current, connection_mode: 'coexistence' }))}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              isCoexistence
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 bg-slate-50 hover:bg-white'
            }`}
          >
            <QrCode size={18} className={isCoexistence ? 'mt-0.5 text-blue-600' : 'mt-0.5 text-slate-400'} />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Coexistência App + API</span>
              <span className="mt-0.5 block text-xs text-slate-500">O mesmo número continua no WhatsApp Business e no atendimento.</span>
            </span>
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 border-b border-slate-100 px-5 py-5 md:grid-cols-2">
        {!isCoexistence ? (
          <>
            <Field icon={Hash} label="Phone Number ID">
              <input
                value={draft.phone_number_id || ''}
                onChange={(event) => setDraft((current) => ({ ...current, phone_number_id: event.target.value }))}
                className={inputClass}
                placeholder="ID do número na Meta"
              />
            </Field>
            <Field icon={Hash} label="WABA ID (opcional para envio; necessário para webhook)">
              <input
                value={draft.waba_id || ''}
                onChange={(event) => setDraft((current) => ({ ...current, waba_id: event.target.value }))}
                className={inputClass}
                placeholder="WhatsApp Business Account ID"
              />
            </Field>
          </>
        ) : null}
        <Field
          icon={AppWindow}
          label={isCoexistence ? 'App ID' : 'App ID (opcional, somente para webhook)'}
        >
          <input
            value={draft.app_id || ''}
            onChange={(event) => setDraft((current) => ({ ...current, app_id: event.target.value }))}
            className={inputClass}
            placeholder="ID do app Meta for Developers"
          />
        </Field>
        <Field icon={Braces} label="Versão Graph API">
          <input
            value={draft.graph_version || 'v25.0'}
            onChange={(event) => setDraft((current) => ({ ...current, graph_version: event.target.value }))}
            className={inputClass}
            placeholder="v25.0"
          />
        </Field>
        {isCoexistence ? (
          <Field icon={QrCode} label="Configuration ID do Embedded Signup" span>
            <input
              value={draft.embedded_signup_config_id || ''}
              onChange={(event) => setDraft((current) => ({
                ...current,
                embedded_signup_config_id: event.target.value,
              }))}
              className={inputClass}
              placeholder="Configuration ID criado no painel da Meta"
            />
          </Field>
        ) : null}
        <div className="flex flex-col gap-3 md:col-span-2">
          <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 sm:flex-row sm:items-center">
            <div>
              <h5 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <LockKeyhole size={15} className="text-blue-600" />
                Credenciais protegidas
              </h5>
              <p className="mt-1 text-xs text-slate-500">
                {isCoexistence
                  ? 'A coexistência usa o login da Meta e exige as credenciais do app e do webhook.'
                  : 'Para testar envios pela Cloud API, informe apenas o Access Token. App Secret e Verify Token são usados depois, ao configurar o recebimento por webhook.'}
              </p>
              {lastCredentialCheckAt ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Último teste: {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(lastCredentialCheckAt))}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleTestCredentials}
              disabled={isTestingCredentials || !draft.id}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTestingCredentials ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {isTestingCredentials ? 'Testando...' : 'Testar credenciais'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CredentialField
              id={`access-token-${draft.id || 'new'}`}
              icon={KeyRound}
              label={isCoexistence ? 'Access Token da Meta' : 'Access Token (teste ou permanente)'}
              configured={Boolean(conexao.token_configured)}
              check={credentialChecks.accessToken}
              value={tokenInput}
              onChange={(value) => {
                setTokenInput(value);
                setCredentialChecks((current) => ({ ...current, accessToken: undefined }));
              }}
              onRemove={() => handleRemoveSecret('access_token', 'Access Token')}
              isRemoving={removingSecret === 'access_token'}
              placeholder={isCoexistence ? 'Token gerenciado pelo login' : 'Cole o token fornecido pela Meta'}
              managedByLogin={isCoexistence}
              span
            />
            {isCoexistence ? (
              <>
                <CredentialField
                  id={`app-secret-${draft.id || 'new'}`}
                  icon={Shield}
                  label="App Secret"
                  configured={Boolean(conexao.app_secret_configured)}
                  check={credentialChecks.appSecret}
                  value={appSecretInput}
                  onChange={(value) => {
                    setAppSecretInput(value);
                    setCredentialChecks((current) => ({ ...current, appSecret: undefined }));
                  }}
                  onRemove={() => handleRemoveSecret('app_secret', 'App Secret')}
                  isRemoving={removingSecret === 'app_secret'}
                  placeholder="App Secret da Meta"
                />
                <CredentialField
                  id={`verify-token-${draft.id || 'new'}`}
                  icon={Webhook}
                  label="Verify Token do webhook"
                  configured={Boolean(conexao.verify_token_configured)}
                  check={credentialChecks.verifyToken}
                  value={verifyTokenInput}
                  onChange={(value) => {
                    setVerifyTokenInput(value);
                    setCredentialChecks((current) => ({ ...current, verifyToken: undefined }));
                  }}
                  onRemove={() => handleRemoveSecret('verify_token', 'Verify Token')}
                  isRemoving={removingSecret === 'verify_token'}
                  placeholder="Token criado por você"
                />
              </>
            ) : (
              <details className="rounded-xl border border-slate-200 bg-white p-3.5 md:col-span-2">
                <summary className="cursor-pointer text-xs font-bold text-slate-600">
                  Configurar recebimento por webhook (opcional para o número de teste)
                </summary>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Preencha estes campos somente quando for receber mensagens e status da Meta neste sistema.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <CredentialField
                    id={`app-secret-${draft.id || 'new'}`}
                    icon={Shield}
                    label="App Secret"
                    configured={Boolean(conexao.app_secret_configured)}
                    check={credentialChecks.appSecret}
                    value={appSecretInput}
                    onChange={(value) => {
                      setAppSecretInput(value);
                      setCredentialChecks((current) => ({ ...current, appSecret: undefined }));
                    }}
                    onRemove={() => handleRemoveSecret('app_secret', 'App Secret')}
                    isRemoving={removingSecret === 'app_secret'}
                    placeholder="App Secret da Meta"
                  />
                  <CredentialField
                    id={`verify-token-${draft.id || 'new'}`}
                    icon={Webhook}
                    label="Verify Token do webhook"
                    configured={Boolean(conexao.verify_token_configured)}
                    check={credentialChecks.verifyToken}
                    value={verifyTokenInput}
                    onChange={(value) => {
                      setVerifyTokenInput(value);
                      setCredentialChecks((current) => ({ ...current, verifyToken: undefined }));
                    }}
                    onRemove={() => handleRemoveSecret('verify_token', 'Verify Token')}
                    isRemoving={removingSecret === 'verify_token'}
                    placeholder="Token criado por você"
                  />
                </div>
              </details>
            )}
          </div>

          {credentialActionError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">{credentialActionError}</p>
            </div>
          ) : null}
          {credentialActionSuccess ? (
            <div className={`flex items-start gap-2 rounded-lg border p-3 ${
              credentialActionTone === 'warning'
                ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'
            }`}>
              {credentialActionTone === 'warning' ? (
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
              ) : (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
              )}
              <p className={`text-xs ${
                credentialActionTone === 'warning' ? 'text-amber-800' : 'text-emerald-800'
              }`}>{credentialActionSuccess}</p>
            </div>
          ) : null}
        </div>
      </section>

      {isCoexistence ? (
        <section className="px-5 py-5">
          <div className="flex flex-col justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50 p-4 sm:flex-row sm:items-center">
            <div>
              <h5 className="text-sm font-bold text-blue-950">Conectar o WhatsApp Business pela Meta</h5>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-blue-700">
                O login valida a coexistência, guarda o token da linha no Vault, assina a WABA e inicia a sincronização de contatos e histórico.
              </p>
            </div>
            <button
              type="button"
              onClick={handleFacebookLogin}
              disabled={isLaunching}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-700 active:scale-95 disabled:opacity-50"
            >
              {isLaunching ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
              {isLaunching ? 'Concluindo...' : 'Entrar com Facebook'}
            </button>
          </div>

          {coexError ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
              <p className="text-xs text-red-700">{coexError}</p>
            </div>
          ) : null}

          {coexResult ? (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
              <div className="text-xs text-emerald-800">
                <p className="font-bold">Coexistência confirmada e vinculada a esta linha.</p>
                <p className="mt-1 font-mono">{coexResult.displayPhoneNumber || coexResult.phoneNumberId}</p>
                {coexResult.warnings?.length ? (
                  <p className="mt-2 text-amber-700">{coexResult.warnings.join(' ')}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </form>
  );
};

export default WhatsAppLineConfigForm;

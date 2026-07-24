import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AppWindow,
  Braces,
  CheckCircle2,
  Cloud,
  CreditCard,
  ExternalLink,
  Hash,
  KeyRound,
  Loader2,
  Phone,
  QrCode,
  Save,
  Shield,
  Smartphone,
  Webhook,
  XCircle,
} from 'lucide-react';
import type { WhatsAppConexao } from '../../../comunicacao/components/whatsapp/whatsapp.types';
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
          <StatusPill ready={Boolean(conexao.token_configured)}>Token</StatusPill>
          <StatusPill ready={Boolean(conexao.app_secret_configured)}>App Secret</StatusPill>
          <StatusPill ready={Boolean(conexao.verify_token_configured)}>Verify Token</StatusPill>
          <StatusPill ready={Boolean(conexao.waba_subscribed_at)}>WABA</StatusPill>
          <StatusPill ready={Boolean(conexao.webhook_verified_at)}>Webhook</StatusPill>
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
            <Field icon={Hash} label="WABA ID">
              <input
                value={draft.waba_id || ''}
                onChange={(event) => setDraft((current) => ({ ...current, waba_id: event.target.value }))}
                className={inputClass}
                placeholder="WhatsApp Business Account ID"
              />
            </Field>
          </>
        ) : null}
        <Field icon={AppWindow} label="App ID">
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
        <Field icon={Shield} label="App Secret">
          <input
            type="password"
            value={appSecretInput}
            onChange={(event) => setAppSecretInput(event.target.value)}
            className={inputClass}
            placeholder={conexao.app_secret_configured ? 'Configurado — preencha somente para trocar' : 'App Secret da Meta'}
            autoComplete="new-password"
          />
        </Field>
        <Field icon={Webhook} label="Verify Token do webhook">
          <input
            type="password"
            value={verifyTokenInput}
            onChange={(event) => setVerifyTokenInput(event.target.value)}
            className={inputClass}
            placeholder={conexao.verify_token_configured ? 'Configurado — preencha somente para trocar' : 'Token criado por você'}
            autoComplete="new-password"
          />
        </Field>
        {!isCoexistence ? (
          <Field icon={KeyRound} label="Access Token permanente" span>
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              className={inputClass}
              placeholder={conexao.token_configured ? 'Configurado — preencha somente para trocar' : 'Token do System User'}
              autoComplete="new-password"
            />
          </Field>
        ) : null}
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

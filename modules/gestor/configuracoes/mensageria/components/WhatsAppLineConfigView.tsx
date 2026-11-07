import React from 'react';
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
  Phone,
  QrCode,
  RefreshCw,
  Save,
  Shield,
  Smartphone,
  Webhook,
  XCircle,
} from 'lucide-react';
import type { WhatsAppConexao } from '../../../comunicacao/components/whatsapp/whatsapp.types';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import { CredentialField, Field, inputClass, StatusPill } from './WhatsAppLineFields';
import type { CredentialKey, CredentialCheck, SecretKind } from './WhatsAppLineConfig.types';

interface WhatsAppLineConfigViewProps {
  conexao: WhatsAppConexao;
  draft: Partial<WhatsAppConexao>;
  setDraft: React.Dispatch<React.SetStateAction<Partial<WhatsAppConexao>>>;
  onNameChange?: (name: string) => void;
  isCoexistence: boolean;
  bgColor: string;
  isSaving: boolean;
  handleSubmit: (event: React.FormEvent) => Promise<void>;
  credentialChecks: Partial<Record<CredentialKey, CredentialCheck>>;
  setCredentialChecks: React.Dispatch<React.SetStateAction<Partial<Record<CredentialKey, CredentialCheck>>>>;
  tokenInput: string;
  setTokenInput: React.Dispatch<React.SetStateAction<string>>;
  appSecretInput: string;
  setAppSecretInput: React.Dispatch<React.SetStateAction<string>>;
  verifyTokenInput: string;
  setVerifyTokenInput: React.Dispatch<React.SetStateAction<string>>;
  isTestingCredentials: boolean;
  removingSecret: SecretKind | null;
  credentialActionError: string | null;
  credentialActionSuccess: string | null;
  credentialActionTone: 'success' | 'warning';
  lastCredentialCheckAt: string | null;
  handleTestCredentials: () => Promise<void>;
  handleRemoveSecret: (kind: SecretKind, label: string) => Promise<void>;
  handleFacebookLogin: () => Promise<void>;
  isLaunching: boolean;
  coexResult: { wabaId?: string | null; phoneNumberId?: string | null; displayPhoneNumber?: string | null; warnings?: string[] } | null;
  coexError: string | null;
}

const WhatsAppLineConfigView = ({
  conexao,
  draft,
  setDraft,
  onNameChange,
  isCoexistence,
  bgColor,
  isSaving,
  handleSubmit,
  credentialChecks,
  setCredentialChecks,
  tokenInput,
  setTokenInput,
  appSecretInput,
  setAppSecretInput,
  verifyTokenInput,
  setVerifyTokenInput,
  isTestingCredentials,
  removingSecret,
  credentialActionError,
  credentialActionSuccess,
  credentialActionTone,
  lastCredentialCheckAt,
  handleTestCredentials,
  handleRemoveSecret,
  handleFacebookLogin,
  isLaunching,
  coexResult,
  coexError
}: WhatsAppLineConfigViewProps) => {
  return (
    <form onSubmit={handleSubmit} className="config-line-form animate-fadeIn overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
          <InstitutionalSelect
            ariaLabel="Função da linha"
            value={draft.is_matriz_financeira ? 'true' : 'false'}
            onValueChange={(value) => setDraft((current) => ({
              ...current,
              is_matriz_financeira: value === 'true',
            }))}
            options={[
              { value: 'true', label: 'Matriz financeira principal' },
              { value: 'false', label: 'Atendimento geral' },
            ]}
          />
        </Field>
        <Field icon={CheckCircle2} label="Operação">
          <InstitutionalSelect
            ariaLabel="Operação"
            value={draft.status || 'ativo'}
            onValueChange={(value) => setDraft((current) => ({
              ...current,
              status: value as 'ativo' | 'inativo',
            }))}
            options={[
              { value: 'ativo', label: 'Linha ativa' },
              { value: 'inativo', label: 'Linha inativa' },
            ]}
          />
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

export default WhatsAppLineConfigView;

import React, { useState, useEffect, useMemo } from 'react';
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
  XCircle,
} from 'lucide-react';
import type { WhatsAppConexao } from '../../../comunicacao/components/whatsapp/whatsapp.types';
import { loadFacebookSdk, facebookWindow } from './whatsapp-coexistence/facebookSdk';
import { isTrustedFacebookOrigin, parseSessionPayload, embeddedSignupErrorMessage } from './whatsapp-coexistence/sessionPayload';
import { COEXISTENCE_FINISH_EVENT } from './whatsapp-coexistence/constants';

interface WhatsAppLineConfigFormProps {
  conexao: WhatsAppConexao;
  onSave: (data: Partial<WhatsAppConexao> & { tokenInput?: string }) => Promise<void>;
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
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 placeholder:text-slate-300';

const selectClass =
  'h-11 w-full rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 cursor-pointer';

const INST_COLORS: Record<string, string> = {
  universo: 'bg-emerald-600',
  anhanguera: 'bg-blue-600',
  unopar: 'bg-violet-600',
};

export const WhatsAppLineConfigForm: React.FC<WhatsAppLineConfigFormProps> = ({
  conexao,
  onSave,
  isSaving,
  onNameChange,
}) => {
  const [draft, setDraft] = useState<Partial<WhatsAppConexao>>({});
  const [tokenInput, setTokenInput] = useState('');

  // Coexistence state
  const [isLaunching, setIsLaunching] = useState(false);
  const [coexResult, setCoexResult] = useState<{ wabaId?: string; phoneNumberId?: string } | null>(null);
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
      app_secret: conexao.app_secret || '',
      verify_token: conexao.verify_token || '',
    });
    setTokenInput('');
    setCoexResult(null);
    setCoexError(null);
  }, [conexao.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.id) return;

    // If coexistence and we got result from FB, merge phone_number_id and waba_id
    const extra: Partial<WhatsAppConexao> = {};
    if (coexResult) {
      if (coexResult.phoneNumberId) extra.phone_number_id = coexResult.phoneNumberId;
      if (coexResult.wabaId) extra.waba_id = coexResult.wabaId;
    }

    await onSave({ ...draft, ...extra, tokenInput: tokenInput.trim() || undefined });
  };

  // ── Coexistence: Facebook Embedded Signup ────────────────────────────────
  const handleFacebookLogin = async () => {
    const appId = (draft.app_id || '').trim();
    const graphVersion = (draft.graph_version || 'v25.0').trim();
    if (!appId) {
      setCoexError('Preencha o App ID (Meta for Developers) antes de iniciar o login.');
      return;
    }

    setIsLaunching(true);
    setCoexError(null);
    setCoexResult(null);

    const messageHandler = (e: MessageEvent) => {
      if (!isTrustedFacebookOrigin(e.origin)) return;
      if (e.data?.type !== COEXISTENCE_FINISH_EVENT) return;
      const parsed = parseSessionPayload(e.data?.data);
      window.removeEventListener('message', messageHandler);
      if (parsed.wabaId || parsed.phoneNumberId) {
        setCoexResult({ wabaId: parsed.wabaId, phoneNumberId: parsed.phoneNumberId });
        // Merge into draft
        setDraft((prev) => ({
          ...prev,
          waba_id: parsed.wabaId || prev.waba_id,
          phone_number_id: parsed.phoneNumberId || prev.phone_number_id,
        }));
      }
    };
    window.addEventListener('message', messageHandler);

    try {
      await loadFacebookSdk(appId, graphVersion);
      facebookWindow.FB?.login(
        (response) => {
          setIsLaunching(false);
          if (response?.authResponse?.code) {
            // code obtained — embedded signup will fire the message event
          } else {
            setCoexError(embeddedSignupErrorMessage(response));
            window.removeEventListener('message', messageHandler);
          }
        },
        {
          config_id: draft.verify_token || '',
          response_type: 'code',
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: 'coexistence',
            sessionInfoVersion: '3',
          },
        }
      );
    } catch (err: any) {
      setIsLaunching(false);
      setCoexError(err?.message || 'Erro ao carregar o SDK do Facebook.');
      window.removeEventListener('message', messageHandler);
    }
  };

  const isCoexistence = draft.connection_mode === 'coexistence';
  const bgColor = INST_COLORS[draft.instituicao || 'universo'] || 'bg-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-5 animate-fadeIn">

      {/* ── Header ── */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-white ${bgColor}`}>
            <Smartphone size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              {draft.nome || 'Nova Linha'} — Configuração
            </h4>
            <p className="text-xs text-slate-400">
              Defina o modo de conexão, credenciais e status desta linha.
            </p>
          </div>
        </div>
        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={15} />
          {isSaving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* ── Identificação ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-xs font-semibold text-slate-500">Identificação</p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field icon={Smartphone} label="Nome da Linha (nome da aba)">
            <input
              value={draft.nome || ''}
              onChange={(e) => {
                setDraft((prev) => ({ ...prev, nome: e.target.value }));
                onNameChange?.(e.target.value);
              }}
              className={inputClass}
              placeholder="Ex: Universo Principal"
            />
          </Field>
          <Field icon={Phone} label="Número WhatsApp">
            <input
              value={draft.telefone || ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, telefone: e.target.value }))}
              className={inputClass}
              placeholder="+55 79 99999-9999"
            />
          </Field>
        </div>
      </div>

      {/* ── Status ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold text-slate-500">Status da linha</p>
        <div className="flex gap-3">
          {(['ativo', 'inativo'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, status: s }))}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold capitalize transition-all ${
                draft.status === s
                  ? s === 'ativo'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-red-400 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
              }`}
            >
              {s === 'ativo' ? 'Linha Ativa' : 'Linha Inativa'}
            </button>
          ))}
        </div>
        {draft.status === 'inativo' && (
          <p className="mt-2 text-xs text-red-500">
            Esta linha para de receber e enviar mensagens ao salvar.
          </p>
        )}
      </div>

      {/* ── Modo de Conexão ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold text-slate-500">Modo de conexão com a Meta</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, connection_mode: 'cloud_api' }))}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              !isCoexistence
                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400/30'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
            }`}
          >
            <Cloud size={18} className={!isCoexistence ? 'mt-0.5 text-emerald-600' : 'mt-0.5 text-slate-400'} />
            <div>
              <div className="text-sm font-semibold text-slate-800">Cloud API Exclusiva</div>
              <div className="mt-0.5 text-xs text-slate-500">
                Credenciais Meta puras. Número dedicado, sem app no celular.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setDraft((prev) => ({ ...prev, connection_mode: 'coexistence' }))}
            className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
              isCoexistence
                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-400/30'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
            }`}
          >
            <QrCode size={18} className={isCoexistence ? 'mt-0.5 text-blue-600' : 'mt-0.5 text-slate-400'} />
            <div>
              <div className="text-sm font-semibold text-slate-800">Coexistência (App + API)</div>
              <div className="mt-0.5 text-xs text-slate-500">
                Celular do atendente continua ativo e o robô funciona em paralelo.
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ── CLOUD API: campos de credencial ── */}
      {!isCoexistence && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="mb-4 text-xs font-semibold text-slate-500">Credenciais Meta API — Cloud API</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field icon={Hash} label="Phone Number ID">
              <input
                value={draft.phone_number_id || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, phone_number_id: e.target.value }))}
                className={inputClass}
                placeholder="ID do número na Meta"
              />
            </Field>
            <Field icon={Hash} label="WABA ID (WhatsApp Business Account)">
              <input
                value={draft.waba_id || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, waba_id: e.target.value }))}
                className={inputClass}
                placeholder="WABA ID"
              />
            </Field>
            <Field icon={Braces} label="Versão Graph API">
              <input
                value={draft.graph_version || 'v25.0'}
                onChange={(e) => setDraft((prev) => ({ ...prev, graph_version: e.target.value }))}
                className={inputClass}
                placeholder="v25.0"
              />
            </Field>
            <Field icon={AppWindow} label="App ID">
              <input
                value={draft.app_id || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, app_id: e.target.value }))}
                className={inputClass}
                placeholder="ID do app Meta for Developers"
              />
            </Field>
            <Field icon={Shield} label="Verify Token Webhook">
              <input
                value={draft.verify_token || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, verify_token: e.target.value }))}
                className={inputClass}
                placeholder="Token secreto de validação"
              />
            </Field>
            <Field icon={CreditCard} label="Disparo de Boletos / PIX">
              <select
                value={draft.is_matriz_financeira ? 'true' : 'false'}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, is_matriz_financeira: e.target.value === 'true' }))
                }
                className={selectClass}
              >
                <option value="true">Sim — Matriz Financeira Principal</option>
                <option value="false">Não — Apenas Atendimento Geral</option>
              </select>
            </Field>
            <Field icon={KeyRound} label="Access Token Permanente (System User)" span>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className={inputClass}
                placeholder={
                  conexao.token_configured
                    ? 'Token já configurado. Preencha apenas para alterar.'
                    : 'Cole o token EAAG... aqui'
                }
              />
            </Field>
          </div>
        </div>
      )}

      {/* ── COEXISTÊNCIA: Facebook Embedded Signup ── */}
      {isCoexistence && (
        <div className="space-y-4">
          {/* App ID necessário para iniciar o login */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="mb-4 text-xs font-semibold text-slate-500">Configuração para Coexistência</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field icon={AppWindow} label="App ID (Meta for Developers)">
                <input
                  value={draft.app_id || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, app_id: e.target.value }))}
                  className={inputClass}
                  placeholder="ID do app Meta (obrigatório para login)"
                />
              </Field>
              <Field icon={Braces} label="Versão Graph API">
                <input
                  value={draft.graph_version || 'v25.0'}
                  onChange={(e) => setDraft((prev) => ({ ...prev, graph_version: e.target.value }))}
                  className={inputClass}
                  placeholder="v25.0"
                />
              </Field>
              <Field icon={Shield} label="Configuration ID (Embedded Signup)">
                <input
                  value={draft.verify_token || ''}
                  onChange={(e) => setDraft((prev) => ({ ...prev, verify_token: e.target.value }))}
                  className={inputClass}
                  placeholder="config_id do Embedded Signup"
                />
              </Field>
              <Field icon={CreditCard} label="Disparo de Boletos / PIX">
                <select
                  value={draft.is_matriz_financeira ? 'true' : 'false'}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, is_matriz_financeira: e.target.value === 'true' }))
                  }
                  className={selectClass}
                >
                  <option value="true">Sim — Matriz Financeira Principal</option>
                  <option value="false">Não — Apenas Atendimento Geral</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Botão de Login Facebook */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h5 className="text-sm font-bold text-blue-900">
                  Login via Facebook — Embedded Signup
                </h5>
                <p className="mt-1 text-xs text-blue-700">
                  Ao clicar, o Facebook abrirá em uma nova janela. Selecione o número do WhatsApp Business App
                  que deseja conectar e escaneie o QR Code sem remover do celular.
                </p>
                {!draft.app_id && (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Preencha o App ID acima antes de iniciar.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleFacebookLogin}
                disabled={isLaunching || !draft.app_id}
                className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
              >
                {isLaunching ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                {isLaunching ? 'Aguardando...' : 'Entrar com Facebook'}
              </button>
            </div>

            {/* Erro */}
            {coexError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />
                <p className="text-xs text-red-700">{coexError}</p>
              </div>
            )}

            {/* Sucesso: IDs obtidos */}
            {coexResult && (coexResult.wabaId || coexResult.phoneNumberId) && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                <div className="text-xs text-emerald-800">
                  <p className="font-bold">Número conectado com sucesso via Facebook!</p>
                  {coexResult.wabaId && <p className="mt-1">WABA ID: <span className="font-mono">{coexResult.wabaId}</span></p>}
                  {coexResult.phoneNumberId && <p>Phone Number ID: <span className="font-mono">{coexResult.phoneNumberId}</span></p>}
                  <p className="mt-2 font-semibold">Clique em "Salvar" para confirmar a configuração.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer Salvar ── */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
        >
          <Save size={16} />
          {isSaving ? 'Salvando...' : `Salvar — ${draft.nome}`}
        </button>
      </div>
    </form>
  );
};

export default WhatsAppLineConfigForm;

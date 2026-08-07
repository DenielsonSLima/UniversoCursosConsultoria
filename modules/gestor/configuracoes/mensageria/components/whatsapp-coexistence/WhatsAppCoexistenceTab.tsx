import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Copy,
  ExternalLink,
  History,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  PhoneForwarded,
  PlugZap,
  QrCode,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { mensageriaService } from '../../mensageria.service';
import type { WhatsAppEmbeddedSignupResult } from '../../mensageria.types';
import {
  COEXISTENCE_FINISH_EVENT,
  DEFAULT_GRAPH_VERSION,
  META_COEXISTENCE_DOCS_URL,
  fieldClass,
} from './constants';
import Field from './Field';
import { facebookWindow, loadFacebookSdk } from './facebookSdk';
import {
  embeddedSignupErrorMessage,
  isTrustedFacebookOrigin,
  parseSessionPayload,
} from './sessionPayload';
import type { LoginResult, SessionEntry, WhatsAppCoexistenceTabProps } from './types';

const WhatsAppCoexistenceTab: React.FC<WhatsAppCoexistenceTabProps> = ({
  connectionId,
  draft,
  activeConfig,
  webhookUrl,
  onChange,
}) => {
  const queryClient = useQueryClient();
  const [isLaunching, setIsLaunching] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<SessionEntry[]>([]);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [onboardingResult, setOnboardingResult] = useState<WhatsAppEmbeddedSignupResult | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [candidateConnection, setCandidateConnection] = useState<{
    wabaId?: string;
    phoneNumberId?: string;
    businessId?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const latestCodeRef = useRef<string | null>(null);
  const latestSessionEventRef = useRef<Record<string, unknown> | null>(null);
  const completedCodeRef = useRef<string | null>(null);
  const pendingLaunchWarningRef = useRef<number | null>(null);
  const pendingSessionWarningRef = useRef<number | null>(null);

  const appId = (draft.waAppId || '').trim();
  const configurationId = (draft.waEmbeddedSignupConfigId || '').trim();
  const graphVersion = (draft.waGraphVersion || DEFAULT_GRAPH_VERSION).trim();
  const canLaunch = !isLaunching && !isCompleting;

  const lastSessionEvent = sessionEvents[0]?.payload || null;
  const lastSessionEventName = typeof lastSessionEvent?.event === 'string' ? lastSessionEvent.event : null;
  const lastSessionJson = useMemo(() => (
    lastSessionEvent ? JSON.stringify(lastSessionEvent, null, 2) : ''
  ), [lastSessionEvent]);

  const clearPendingSessionWarning = useCallback(() => {
    if (!pendingSessionWarningRef.current) return;
    window.clearTimeout(pendingSessionWarningRef.current);
    pendingSessionWarningRef.current = null;
  }, []);

  const clearPendingLaunchWarning = useCallback(() => {
    if (!pendingLaunchWarningRef.current) return;
    window.clearTimeout(pendingLaunchWarningRef.current);
    pendingLaunchWarningRef.current = null;
  }, []);

  const scheduleMissingLaunchWarning = useCallback(() => {
    clearPendingLaunchWarning();
    pendingLaunchWarningRef.current = window.setTimeout(() => {
      if (latestCodeRef.current || latestSessionEventRef.current || completedCodeRef.current) return;

      setIsLaunching(false);
      setOnboardingError(
        'A Meta abriu o popup, mas nao retornou code nem evento do WhatsApp. Se a tela disser que esta pessoa nao pode integrar clientes no momento, a App/conta da Meta ainda nao esta habilitada para onboarding de clientes. Feche o popup e confira Acoes necessarias, App Review, Access Verification e permissoes avancadas no Meta for Developers.',
      );
    }, 12000);
  }, [clearPendingLaunchWarning]);

  const scheduleMissingSessionWarning = useCallback((code: string) => {
    clearPendingSessionWarning();
    pendingSessionWarningRef.current = window.setTimeout(() => {
      if (
        latestCodeRef.current !== code ||
        latestSessionEventRef.current ||
        completedCodeRef.current === code
      ) return;

      setOnboardingError(
        'A Meta retornou apenas o code, mas nao enviou o evento do WhatsApp. No popup, clique em Editar configuracoes e conclua a selecao da conta/numero do WhatsApp. Se continuar aparecendo so vinculacao anterior, crie uma nova Configuration ID com o modelo WhatsApp Embedded Signup.',
      );
    }, 8000);
  }, [clearPendingSessionWarning]);

  const completeEmbeddedSignup = useCallback(async (code: string, sessionEvent: Record<string, unknown>) => {
    if (completedCodeRef.current === code) return;
    clearPendingLaunchWarning();
    clearPendingSessionWarning();

    const eventName = typeof sessionEvent.event === 'string' ? sessionEvent.event : '';
    if (eventName !== COEXISTENCE_FINISH_EVENT) {
      setOnboardingError('A Meta retornou um fluxo finalizado, mas nao foi o evento de coexistencia.');
      return;
    }

    completedCodeRef.current = code;
    setIsCompleting(true);
    setOnboardingError(null);

    try {
      const result = await mensageriaService.completeWhatsAppEmbeddedSignup({
        connectionId,
        code,
        mode: 'coexistence',
        appId,
        appSecret: draft.waAppSecret,
        graphVersion,
        configurationId,
        sessionEvent,
      });

      if (!result.coexistenceVerified) {
        throw new Error('A Meta concluiu o popup, mas não confirmou o número em coexistência.');
      }

      setOnboardingResult(result);
      await queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] });
    } catch (error) {
      completedCodeRef.current = null;
      setOnboardingError(error instanceof Error ? error.message : 'Nao foi possivel concluir o Embedded Signup.');
    } finally {
      setIsCompleting(false);
    }
  }, [appId, clearPendingLaunchWarning, clearPendingSessionWarning, configurationId, connectionId, draft.waAppSecret, graphVersion, queryClient]);

  useEffect(() => {
    const handleMessage = (event: any) => {
      if (!isTrustedFacebookOrigin(event.origin)) return;

      const payload = parseSessionPayload(event.data);
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;

      setSessionEvents((current) => [
        { receivedAt: new Date().toISOString(), payload },
        ...current,
      ].slice(0, 5));

      latestSessionEventRef.current = payload;
      clearPendingLaunchWarning();
      clearPendingSessionWarning();

      if (payload.event === 'CANCEL' || payload.event === 'ERROR') {
        setOnboardingError(embeddedSignupErrorMessage(payload));
        return;
      }

      const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : null;
      if (data) {
        setCandidateConnection({
          wabaId: typeof data.waba_id === 'string' ? data.waba_id : undefined,
          phoneNumberId: typeof data.phone_number_id === 'string' ? data.phone_number_id : undefined,
          businessId: typeof data.business_id === 'string' ? data.business_id : undefined,
        });
      }

      if (payload.event === COEXISTENCE_FINISH_EVENT && latestCodeRef.current) {
        void completeEmbeddedSignup(latestCodeRef.current, payload);
      }

      if (payload.event === 'FINISH') {
        setOnboardingError('O fluxo terminou como Cloud API padrao. A tela de coexistencia nao apareceu para esta App/configuracao.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      clearPendingLaunchWarning();
      clearPendingSessionWarning();
    };
  }, [clearPendingLaunchWarning, clearPendingSessionWarning, completeEmbeddedSignup]);

  const handleLaunch = async () => {
    if (!appId || !configurationId) {
      setLoginResult({
        receivedAt: new Date().toISOString(),
        status: 'error',
        message: 'Informe App ID e Configuration ID antes de abrir o fluxo.',
      });
      return;
    }

    setIsLaunching(true);
    setOnboardingResult(null);
    setOnboardingError(null);
    setCandidateConnection(null);
    setLoginResult(null);
    clearPendingLaunchWarning();
    clearPendingSessionWarning();
    latestCodeRef.current = null;
    latestSessionEventRef.current = null;
    completedCodeRef.current = null;

    try {
      await loadFacebookSdk(appId, graphVersion || DEFAULT_GRAPH_VERSION);
      scheduleMissingLaunchWarning();
      const facebookSdk = facebookWindow().FB;
      if (!facebookSdk) {
        throw new Error('O SDK do Facebook não ficou disponível para abrir o Embedded Signup.');
      }

      facebookSdk.login((response) => {
        setIsLaunching(false);
        const code = response.authResponse?.code;
        if (code) {
          clearPendingLaunchWarning();
          latestCodeRef.current = code;
          setLoginResult({
            receivedAt: new Date().toISOString(),
            status: 'success',
            message: 'Code recebido da Meta.',
            code,
            raw: response,
          });

          if (latestSessionEventRef.current) {
            void completeEmbeddedSignup(code, latestSessionEventRef.current);
          } else {
            scheduleMissingSessionWarning(code);
          }
          return;
        }

        clearPendingLaunchWarning();
        setLoginResult({
          receivedAt: new Date().toISOString(),
          status: response.status === 'unknown' ? 'cancelled' : 'error',
          message: response.status === 'unknown'
            ? 'Fluxo cancelado ou fechado antes da autorizacao.'
            : 'A Meta nao retornou code no callback.',
          raw: response,
        });
      }, {
        config_id: configurationId,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: '3',
          featureType: 'whatsapp_business_app_onboarding',
        },
      });
    } catch (error) {
      setIsLaunching(false);
      setLoginResult({
        receivedAt: new Date().toISOString(),
        status: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel abrir o Embedded Signup.',
      });
    }
  };

  const handleCopySession = async () => {
    if (!lastSessionJson) return;
    await navigator.clipboard.writeText(lastSessionJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const readiness = [
    { label: 'App ID', value: appId || 'Nao informado', ready: Boolean(appId), icon: KeyRound },
    { label: 'Configuration ID', value: configurationId || 'Nao informado', ready: Boolean(configurationId), icon: Link2 },
    { label: 'Webhook', value: webhookUrl, ready: Boolean(webhookUrl), icon: ShieldCheck },
  ];
  const coexistenceVerified = activeConfig?.waConnectionMode === 'coexistence' && Boolean(activeConfig.waCoexistenceVerifiedAt);
  const cloudApiActive = activeConfig?.waConnectionMode !== 'coexistence' && Boolean(activeConfig?.waEnabled && activeConfig.waPhoneNumberId);
  const activeNumber = activeConfig?.waDisplayPhoneNumber || 'Número não informado';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
              <PlugZap size={21} />
            </span>
            <div>
              <h4 className="text-sm font-black uppercase tracking-tight text-emerald-950">Coexistencia via Embedded Signup</h4>
              <p className="mt-1 max-w-3xl text-xs font-bold leading-relaxed text-emerald-700">
                Para numero que ja usa WhatsApp Business App, o fluxo correto abre pela sua aplicacao e retorna o evento de onboarding do Business App.
              </p>
            </div>
          </div>
          <a
            href={META_COEXISTENCE_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[36px] items-center justify-center gap-2 rounded-lg bg-white px-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
          >
            <ExternalLink size={13} />
            Docs Meta
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {readiness.map(({ label, value, ready, icon: Icon }) => (
          <div key={label} className={`rounded-lg border p-4 ${ready ? 'border-emerald-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <Icon size={13} />
              {label}
            </div>
            <div className="mt-3 flex items-start justify-between gap-3">
              <p className="min-w-0 break-all font-mono text-xs font-bold text-slate-700">{value}</p>
              {ready ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : <XCircle size={16} className="shrink-0 text-amber-600" />}
            </div>
          </div>
        ))}
      </div>

      <div className={`rounded-xl border p-5 ${
        coexistenceVerified
          ? 'border-emerald-200 bg-emerald-50'
          : cloudApiActive
            ? 'border-blue-200 bg-blue-50'
            : 'border-slate-200 bg-slate-50'
      }`}>
        <div className="flex items-start gap-3">
          {coexistenceVerified
            ? <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" />
            : cloudApiActive
              ? <Cloud size={22} className="mt-0.5 shrink-0 text-blue-700" />
              : <QrCode size={22} className="mt-0.5 shrink-0 text-slate-500" />}
          <div>
            <h4 className={`text-sm font-black uppercase tracking-tight ${
              coexistenceVerified ? 'text-emerald-950' : cloudApiActive ? 'text-blue-950' : 'text-slate-800'
            }`}>
              {coexistenceVerified
                ? 'Número ativo em coexistência'
                : cloudApiActive
                  ? 'Sua conexão Cloud API atual está protegida'
                  : 'Nenhum número ativo será alterado antes do QR Code'}
            </h4>
            <p className={`mt-1 text-xs font-bold leading-relaxed ${
              coexistenceVerified ? 'text-emerald-700' : cloudApiActive ? 'text-blue-700' : 'text-slate-500'
            }`}>
              {coexistenceVerified
                ? `${activeNumber} continua no WhatsApp Business App do celular e também está ativo na Cloud API.`
                : cloudApiActive
                  ? `${activeNumber} continuará funcionando exclusivamente pela Cloud API enquanto você entra com o Facebook e escolhe outro número do WhatsApp Business App.`
                  : 'O portal somente ativará o número escolhido quando a Meta concluir o onboarding e confirmar is_on_biz_app=true.'}
            </p>
            {coexistenceVerified ? (
              <p className="mt-2 text-[11px] font-bold text-emerald-700">
                Contatos: {activeConfig?.waContactsSyncStatus || 'not_requested'} · Histórico: {activeConfig?.waHistorySyncStatus || 'not_requested'}
                {typeof activeConfig?.waHistorySyncProgress === 'number' ? ` (${activeConfig.waHistorySyncProgress}%)` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Field icon={KeyRound} label="App ID da Meta">
          <input
            value={draft.waAppId || ''}
            onChange={(event) => onChange('waAppId', event.target.value)}
            className={fieldClass}
            placeholder="ID do app no Meta for Developers"
          />
        </Field>

        <Field icon={ShieldCheck} label="App Secret">
          <input
            type="password"
            value={draft.waAppSecret || ''}
            onChange={(event) => onChange('waAppSecret', event.target.value)}
            className={fieldClass}
            placeholder="Preencha se ainda nao estiver salvo"
          />
        </Field>

        <Field icon={Link2} label="Configuration ID do Embedded Signup">
          <input
            value={draft.waEmbeddedSignupConfigId || ''}
            onChange={(event) => onChange('waEmbeddedSignupConfigId', event.target.value)}
            className={fieldClass}
            placeholder="ID criado em Facebook Login for Business"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[#001a33]">
              <Smartphone size={20} />
            </span>
            <div>
              <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Entrar com Facebook e conectar pelo QR Code</h4>
              <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                Escolha no popup a opção de conectar um WhatsApp Business App existente. O número pode ser diferente da conexão Cloud API atual.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLaunch}
            disabled={!canLaunch}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isLaunching || isCompleting ? <Loader2 size={15} className="animate-spin" /> : <PhoneForwarded size={15} />}
            {isCompleting
              ? 'Validando número...'
              : isLaunching
                ? 'Abrindo Meta...'
                : coexistenceVerified
                  ? 'Conectar outro número'
                  : 'Entrar com Facebook e QR'}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['1', 'Entrar no Facebook', 'Use uma conta administradora do portfólio empresarial.'],
            ['2', 'Escolher o Business App', 'Selecione conectar uma conta existente, não adicionar Cloud API padrão.'],
            ['3', 'Escanear o QR', 'No celular, confirme no WhatsApp Business App e leia o QR exibido pela Meta.'],
            ['4', 'Ativação automática', 'Somente após a validação final o portal substitui o número atualmente ativo.'],
          ].map(([step, title, description]) => (
            <div key={step} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#001a33] text-[10px] font-black text-white">{step}</span>
              <p className="mt-3 text-[11px] font-black uppercase tracking-tight text-[#001a33]">{title}</p>
              <p className="mt-1 text-[11px] font-bold leading-relaxed text-slate-500">{description}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <ClipboardCheck size={13} />
              Evento esperado
            </div>
            <p className="mt-3 break-words font-mono text-xs font-black text-emerald-700">{COEXISTENCE_FINISH_EVENT}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <History size={13} />
              Ultimo evento
            </div>
            <p className="mt-3 break-words font-mono text-xs font-black text-slate-700">{lastSessionEventName || 'Aguardando retorno'}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <MessageCircle size={13} />
              Callback
            </div>
            <p className="mt-3 break-words text-xs font-black text-slate-700">{loginResult?.message || 'Aguardando code'}</p>
          </div>
        </div>
      </div>

      {candidateConnection && !onboardingResult ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <QrCode size={22} className="mt-0.5 shrink-0 text-blue-700" />
            <div>
              <h4 className="text-sm font-black uppercase tracking-tight text-blue-950">Número candidato recebido da Meta</h4>
              <p className="mt-1 text-xs font-bold leading-relaxed text-blue-700">
                WABA {candidateConnection.wabaId || '-'} · Phone Number ID {candidateConnection.phoneNumberId || '-'}.
                A conexão ativa ainda não foi alterada; o backend está aguardando a confirmação oficial de coexistência.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {onboardingResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" />
            <div>
              <h4 className="text-sm font-black uppercase tracking-tight text-emerald-950">Coexistencia conectada</h4>
              <p className="mt-1 text-xs font-bold leading-relaxed text-emerald-700">
                WABA {onboardingResult.wabaId || '-'} · Phone Number ID {onboardingResult.phoneNumberId || '-'} · {onboardingResult.platformType || 'platform_type pendente'}
              </p>
              {onboardingResult.syncRequests && onboardingResult.syncRequests.length > 0 && (
                <p className="mt-2 text-xs font-bold text-emerald-700">
                  Sincronizacoes iniciadas: {onboardingResult.syncRequests.map((item) => item.syncType).join(', ')}.
                </p>
              )}
              {onboardingResult.warnings && onboardingResult.warnings.length > 0 && (
                <div className="mt-3 space-y-1">
                  {onboardingResult.warnings.map((warning) => (
                    <p key={warning} className="text-xs font-bold text-amber-700">{warning}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {onboardingError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={22} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <h4 className="text-sm font-black uppercase tracking-tight text-amber-950">Verificacao de coexistencia pendente</h4>
              <p className="mt-1 text-xs font-bold leading-relaxed text-amber-700">{onboardingError}</p>
            </div>
          </div>
        </div>
      )}

      {lastSessionEvent && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]">
              <History size={16} className="text-emerald-600" />
              Retorno do Embedded Signup
            </h4>
            <button
              onClick={handleCopySession}
              className="inline-flex min-h-[34px] items-center justify-center gap-2 rounded-lg bg-slate-100 px-3 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-200"
            >
              <Copy size={13} />
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg bg-[#001a33] p-4 text-xs font-bold leading-relaxed text-emerald-100">
            {lastSessionJson}
          </pre>
        </div>
      )}
    </div>
  );
};

export default WhatsAppCoexistenceTab;

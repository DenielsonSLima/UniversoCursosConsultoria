import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  History,
  KeyRound,
  Link2,
  Loader2,
  MessageCircle,
  PhoneForwarded,
  PlugZap,
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
import { parseSessionPayload } from './sessionPayload';
import type { LoginResult, SessionEntry, WhatsAppCoexistenceTabProps } from './types';

const WhatsAppCoexistenceTab: React.FC<WhatsAppCoexistenceTabProps> = ({ draft, webhookUrl, onChange }) => {
  const queryClient = useQueryClient();
  const [isLaunching, setIsLaunching] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<SessionEntry[]>([]);
  const [loginResult, setLoginResult] = useState<LoginResult | null>(null);
  const [onboardingResult, setOnboardingResult] = useState<WhatsAppEmbeddedSignupResult | null>(null);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const latestCodeRef = useRef<string | null>(null);
  const latestSessionEventRef = useRef<Record<string, unknown> | null>(null);
  const completedCodeRef = useRef<string | null>(null);

  const appId = (draft.waAppId || '').trim();
  const configurationId = (draft.waEmbeddedSignupConfigId || '').trim();
  const graphVersion = (draft.waGraphVersion || DEFAULT_GRAPH_VERSION).trim();
  const canLaunch = !isLaunching && !isCompleting;

  const lastSessionEvent = sessionEvents[0]?.payload || null;
  const lastSessionEventName = typeof lastSessionEvent?.event === 'string' ? lastSessionEvent.event : null;
  const lastSessionJson = useMemo(() => (
    lastSessionEvent ? JSON.stringify(lastSessionEvent, null, 2) : ''
  ), [lastSessionEvent]);

  const completeEmbeddedSignup = useCallback(async (code: string, sessionEvent: Record<string, unknown>) => {
    if (completedCodeRef.current === code) return;

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
        code,
        mode: 'coexistence',
        appId,
        appSecret: draft.waAppSecret,
        graphVersion,
        configurationId,
        sessionEvent,
      });

      setOnboardingResult(result);
      if (result.wabaId) onChange('waBusinessAccountId', result.wabaId);
      if (result.phoneNumberId) onChange('waPhoneNumberId', result.phoneNumberId);
      if (result.displayPhoneNumber) onChange('waDisplayPhoneNumber', result.displayPhoneNumber);
      onChange('waEnabled', true);
      onChange('waStatus', 'configurado');
      queryClient.invalidateQueries({ queryKey: ['mensageria_config', 'whatsapp'] });
    } catch (error) {
      completedCodeRef.current = null;
      setOnboardingError(error instanceof Error ? error.message : 'Nao foi possivel concluir o Embedded Signup.');
    } finally {
      setIsCompleting(false);
    }
  }, [appId, configurationId, draft.waAppSecret, graphVersion, onChange, queryClient]);

  useEffect(() => {
    const handleMessage = (event: any) => {
      if (!event.origin.endsWith('facebook.com')) return;

      const payload = parseSessionPayload(event.data);
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;

      setSessionEvents((current) => [
        { receivedAt: new Date().toISOString(), payload },
        ...current,
      ].slice(0, 5));

      latestSessionEventRef.current = payload;

      const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : null;
      if (typeof data?.waba_id === 'string') onChange('waBusinessAccountId', data.waba_id);
      if (typeof data?.phone_number_id === 'string') onChange('waPhoneNumberId', data.phone_number_id);

      if (payload.event === COEXISTENCE_FINISH_EVENT && latestCodeRef.current) {
        void completeEmbeddedSignup(latestCodeRef.current, payload);
      }

      if (payload.event === 'FINISH') {
        setOnboardingError('O fluxo terminou como Cloud API padrao. A tela de coexistencia nao apareceu para esta App/configuracao.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [completeEmbeddedSignup, onChange]);

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
    setLoginResult(null);
    latestCodeRef.current = null;
    latestSessionEventRef.current = null;
    completedCodeRef.current = null;

    try {
      await loadFacebookSdk(appId, graphVersion || DEFAULT_GRAPH_VERSION);
      facebookWindow().FB?.login((response) => {
        const code = response.authResponse?.code;
        if (code) {
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
          }
          return;
        }

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
          version: 'v4',
          setup: {},
          sessionInfoVersion: '3',
          featureType: 'whatsapp_business_app_onboarding',
        },
      });
    } catch (error) {
      setLoginResult({
        receivedAt: new Date().toISOString(),
        status: 'error',
        message: error instanceof Error ? error.message : 'Nao foi possivel abrir o Embedded Signup.',
      });
    } finally {
      setIsLaunching(false);
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
              <h4 className="text-sm font-black uppercase tracking-tight text-[#001a33]">Adicionar numero em coexistencia</h4>
              <p className="mt-1 text-xs font-bold leading-relaxed text-slate-500">
                O popup deve mostrar a opcao de conectar uma conta existente do WhatsApp Business App.
              </p>
            </div>
          </div>

          <button
            onClick={handleLaunch}
            disabled={!canLaunch}
            className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-emerald-900/20 transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
          >
            {isLaunching || isCompleting ? <Loader2 size={15} className="animate-spin" /> : <PhoneForwarded size={15} />}
            {isCompleting ? 'Concluindo...' : isLaunching ? 'Abrindo...' : 'Abrir Embedded Signup'}
          </button>
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

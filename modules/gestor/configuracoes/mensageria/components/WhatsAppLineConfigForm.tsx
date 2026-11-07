import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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

import WhatsAppLineConfigView from './WhatsAppLineConfigView';
import type { WhatsAppLineConfigFormProps, CredentialKey, CredentialCheck, SecretKind } from './WhatsAppLineConfig.types';

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
    <WhatsAppLineConfigView
      conexao={conexao}
      draft={draft}
      setDraft={setDraft}
      onNameChange={onNameChange}
      isCoexistence={isCoexistence}
      bgColor={bgColor}
      isSaving={isSaving}
      handleSubmit={handleSubmit}
      credentialChecks={credentialChecks}
      setCredentialChecks={setCredentialChecks}
      tokenInput={tokenInput}
      setTokenInput={setTokenInput}
      appSecretInput={appSecretInput}
      setAppSecretInput={setAppSecretInput}
      verifyTokenInput={verifyTokenInput}
      setVerifyTokenInput={setVerifyTokenInput}
      isTestingCredentials={isTestingCredentials}
      removingSecret={removingSecret}
      credentialActionError={credentialActionError}
      credentialActionSuccess={credentialActionSuccess}
      credentialActionTone={credentialActionTone}
      lastCredentialCheckAt={lastCredentialCheckAt}
      handleTestCredentials={handleTestCredentials}
      handleRemoveSecret={handleRemoveSecret}
      handleFacebookLogin={handleFacebookLogin}
      isLaunching={isLaunching}
      coexResult={coexResult}
      coexError={coexError}
    />
  );
};

export default WhatsAppLineConfigForm;

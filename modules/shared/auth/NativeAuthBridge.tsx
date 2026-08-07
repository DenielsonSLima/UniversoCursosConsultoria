import React, { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { PluginListenerHandle } from '@capacitor/core';
import { useNavigate } from 'react-router';
import {
  clearPendingNativeOAuth,
  consumeNativeOAuthUrl,
  isNativeOAuthPlatform,
  NATIVE_OAUTH_BROWSER_FINISHED_EVENT,
  NATIVE_OAUTH_STARTED_EVENT,
  readPendingNativeOAuth,
  type NativeOAuthErrorCode,
} from './native-oauth';

type NativeOAuthCallbackSource = 'app_url_open' | 'launch_url';

type NativeOAuthLogDetails = {
  source?: NativeOAuthCallbackSource;
  outcome?: NativeOAuthErrorCode | 'success' | 'ignored';
  callbackInFlight?: boolean;
};

const logNativeOAuthEvent = (
  stage: string,
  details: NativeOAuthLogDetails = {},
) => {
  // Keep diagnostics intentionally metadata-only. OAuth callback URLs, codes,
  // tokens and provider errors must never reach device logs.
  console.info('[native-oauth]', { stage, ...details });
};

const buildAlunoReturnPath = (
  errorCode: NativeOAuthErrorCode | null,
  redirectPath: string | null,
) => {
  const params = new URLSearchParams();
  if (errorCode) params.set('oauth_error', errorCode);
  else params.set('oauth_return', 'success');
  if (redirectPath) params.set('redirect', redirectPath);
  return `/aluno/login-app?${params.toString()}`;
};

const NativeAuthBridge: React.FC = () => {
  const navigate = useNavigate();
  const processedUrlsRef = useRef(new Set<string>());
  const handlingCallbackRef = useRef(false);

  useEffect(() => {
    if (!isNativeOAuthPlatform()) return undefined;

    let disposed = false;
    let appUrlHandle: PluginListenerHandle | undefined;
    let browserHandle: PluginListenerHandle | undefined;
    let callbackQueue: Promise<void> = Promise.resolve();

    const handleOAuthStarted = () => {
      // The same provider error callback can legitimately occur in two
      // separate attempts. Keep deduplication scoped to the current attempt.
      processedUrlsRef.current.clear();
      logNativeOAuthEvent('attempt_started');
    };
    window.addEventListener(NATIVE_OAUTH_STARTED_EVENT, handleOAuthStarted);

    const processUrl = async (url: string, source: NativeOAuthCallbackSource) => {
      if (disposed) return;

      handlingCallbackRef.current = true;

      try {
        const result = await consumeNativeOAuthUrl(url);
        if (!result.handled || disposed) {
          logNativeOAuthEvent('callback_ignored', { source, outcome: 'ignored' });
          return;
        }

        await Browser.close().catch(() => undefined);
        if (disposed) return;

        logNativeOAuthEvent('callback_completed', {
          source,
          outcome: result.errorCode ?? 'success',
        });

        if (result.flow === 'aluno') {
          navigate(buildAlunoReturnPath(result.errorCode, result.redirectPath), {
            replace: true,
          });
        }
      } catch {
        logNativeOAuthEvent('callback_failed', { source });
        const pending = await readPendingNativeOAuth().catch(() => null);
        await clearPendingNativeOAuth().catch(() => undefined);
        if (!disposed && pending?.flow === 'aluno') {
          navigate(buildAlunoReturnPath('oauth_failed', pending.redirectPath), {
            replace: true,
          });
        }
      } finally {
        handlingCallbackRef.current = false;
      }
    };

    const handleUrl = (url: string, source: NativeOAuthCallbackSource) => {
      if (disposed) return;
      if (processedUrlsRef.current.has(url)) {
        logNativeOAuthEvent('callback_deduplicated', { source });
        return;
      }

      // Claim the callback synchronously, before the first await. Capacitor can
      // deliver the same cold-start URL through appUrlOpen and getLaunchUrl.
      processedUrlsRef.current.add(url);
      logNativeOAuthEvent('callback_received', { source });

      const queuedCallback = callbackQueue.then(
        () => processUrl(url, source),
        () => processUrl(url, source),
      );
      callbackQueue = queuedCallback.catch(() => undefined);
      return queuedCallback;
    };

    const handleLaunchUrl = async () => {
      const launch = await CapacitorApp.getLaunchUrl();
      if (disposed || !launch?.url) return;
      await handleUrl(launch.url, 'launch_url');
    };

    const installListeners = async () => {
      appUrlHandle = await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        void handleUrl(url, 'app_url_open');
      });
      browserHandle = await Browser.addListener('browserFinished', () => {
        // Android may emit this event merely because its Custom Tab was hidden
        // while the deep link brings the app forward. Preserve the pending
        // attempt for the callback (or its existing ten-minute TTL).
        logNativeOAuthEvent('browser_finished', {
          callbackInFlight: handlingCallbackRef.current,
        });
        window.dispatchEvent(new window.CustomEvent(NATIVE_OAUTH_BROWSER_FINISHED_EVENT));
      });

      await handleLaunchUrl();
    };

    void installListeners().catch(() => {
      logNativeOAuthEvent('bridge_install_failed');
      // O formulário continua utilizável por senha se um plugin nativo não
      // estiver disponível nesta instalação.
    });

    return () => {
      disposed = true;
      window.removeEventListener(NATIVE_OAUTH_STARTED_EVENT, handleOAuthStarted);
      void appUrlHandle?.remove();
      void browserHandle?.remove();
    };
  }, [navigate]);

  return null;
};

export default NativeAuthBridge;

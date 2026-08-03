import React, { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { PluginListenerHandle } from '@capacitor/core';
import { useNavigate } from 'react-router-dom';
import {
  clearPendingNativeOAuth,
  consumeNativeOAuthUrl,
  isNativeOAuthPlatform,
  readPendingNativeOAuth,
  type NativeOAuthErrorCode,
} from './native-oauth';

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
    let browserFinishedTimeoutId = 0;

    const handleUrl = async (url: string) => {
      if (disposed || processedUrlsRef.current.has(url)) return;
      window.clearTimeout(browserFinishedTimeoutId);
      browserFinishedTimeoutId = 0;
      handlingCallbackRef.current = true;

      try {
        const result = await consumeNativeOAuthUrl(url);
        if (!result.handled || disposed) return;
        processedUrlsRef.current.add(url);

        await Browser.close().catch(() => undefined);
        if (disposed) return;

        if (result.flow === 'aluno') {
          navigate(buildAlunoReturnPath(result.errorCode, result.redirectPath), {
            replace: true,
          });
        }
      } catch {
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

    const installListeners = async () => {
      appUrlHandle = await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
        void handleUrl(url);
      });
      browserHandle = await Browser.addListener('browserFinished', () => {
        if (handlingCallbackRef.current) return;
        window.clearTimeout(browserFinishedTimeoutId);
        browserFinishedTimeoutId = window.setTimeout(() => {
          void (async () => {
            const pending = await readPendingNativeOAuth();
            if (!pending || disposed || handlingCallbackRef.current) return;
            await clearPendingNativeOAuth();
            if (!disposed && pending.flow === 'aluno') {
              navigate(buildAlunoReturnPath('cancelled', pending.redirectPath), {
                replace: true,
              });
            }
          })().catch(() => undefined);
        }, 500);
      });

      const launch = await CapacitorApp.getLaunchUrl();
      if (launch?.url) await handleUrl(launch.url);
    };

    void installListeners().catch(() => {
      // O formulário continua utilizável por senha se um plugin nativo não
      // estiver disponível nesta instalação.
    });

    return () => {
      disposed = true;
      window.clearTimeout(browserFinishedTimeoutId);
      void appUrlHandle?.remove();
      void browserHandle?.remove();
    };
  }, [navigate]);

  return null;
};

export default NativeAuthBridge;

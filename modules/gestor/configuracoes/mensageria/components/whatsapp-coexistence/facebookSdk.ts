import { DEFAULT_GRAPH_VERSION, FACEBOOK_SDK_ID, FACEBOOK_SDK_SRC } from './constants';
import type { FacebookWindow } from './types';

export const facebookWindow = () => window as FacebookWindow;

export const loadFacebookSdk = (appId: string, version = DEFAULT_GRAPH_VERSION) =>
  new Promise<void>((resolve, reject) => {
    let settled = false;
    const fbWindow = facebookWindow();
    const finish = () => {
      if (settled) return;
      if (!fbWindow.FB) {
        settled = true;
        reject(new Error('SDK do Facebook nao carregou corretamente.'));
        return;
      }

      fbWindow.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version,
      });
      settled = true;
      resolve();
    };

    if (fbWindow.FB) {
      finish();
      return;
    }

    fbWindow.fbAsyncInit = finish;

    const existingScript = document.getElementById(FACEBOOK_SDK_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', finish, { once: true });
      existingScript.addEventListener('error', () => {
        if (!settled) {
          settled = true;
          reject(new Error('Nao foi possivel carregar o SDK do Facebook.'));
        }
      }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = FACEBOOK_SDK_ID;
    script.src = FACEBOOK_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onload = finish;
    script.onerror = () => {
      if (!settled) {
        settled = true;
        reject(new Error('Nao foi possivel carregar o SDK do Facebook.'));
      }
    };
    document.body.appendChild(script);
  });

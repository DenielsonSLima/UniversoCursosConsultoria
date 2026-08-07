import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { NATIVE_PUSH_BRIDGE_READY_EVENT, NATIVE_PUSH_PERMISSION_CHANGED_EVENT } from './native-app.bridge';

const PUSH_PERMISSION_ONBOARDING_KEY = 'universo.native.push-permission-onboarding-v1';

const NativePushPermissionBootstrap = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;

    let disposed = false;
    let running = false;

    const bootstrap = async () => {
      if (disposed || running) return;
      const bridge = window.UniversoNativeApp;
      if (!bridge) return;

      running = true;
      try {
        const handled = await Preferences.get({ key: PUSH_PERMISSION_ONBOARDING_KEY });
        let push = await bridge.getPushStatus();

        // O diálogo do sistema operacional é exibido somente uma vez, na
        // primeira abertura. Depois disso, qualquer mudança é feita nos
        // Ajustes do Android/iPhone, sem convites repetidos dentro do portal.
        if (!handled.value && push.permissionStatus === 'not_determined') {
          push = await bridge.requestPushPermission();
        }

        if (!handled.value && push.permissionStatus !== 'not_determined') {
          await Preferences.set({ key: PUSH_PERMISSION_ONBOARDING_KEY, value: 'handled' });
        }

        window.dispatchEvent(new window.CustomEvent(NATIVE_PUSH_PERMISSION_CHANGED_EVENT, { detail: push }));
      } catch (error) {
        // Uma falha técnica não é tratada como decisão do usuário; assim a
        // inicialização poderá tentar novamente na próxima abertura.
        console.warn('Não foi possível concluir a configuração inicial das notificações.', error);
      } finally {
        running = false;
      }
    };

    void bootstrap();
    window.addEventListener(NATIVE_PUSH_BRIDGE_READY_EVENT, bootstrap);
    return () => {
      disposed = true;
      window.removeEventListener(NATIVE_PUSH_BRIDGE_READY_EVENT, bootstrap);
    };
  }, []);

  return null;
};

export default NativePushPermissionBootstrap;

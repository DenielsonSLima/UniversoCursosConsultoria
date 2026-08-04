import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import {
  FirebaseMessaging,
  Importance,
  Visibility,
} from '@capacitor-firebase/messaging';
import { Preferences } from '@capacitor/preferences';
import type {
  NativeAppDeviceInfo,
  NativePushPermission,
  NativePushState,
  UniversoNativeAppBridge,
} from './native-app.types';

const INSTALLATION_ID_KEY = 'universo.native.installation-id';
export const NATIVE_PUSH_TOKEN_CHANGED_EVENT = 'universo:native-push-token-changed';
export const NATIVE_PUSH_BRIDGE_READY_EVENT = 'universo:native-push-bridge-ready';
export const NATIVE_PUSH_PERMISSION_CHANGED_EVENT = 'universo:native-push-permission-changed';

type NotificationData = Record<string, unknown>;
type NavigateToPushDestination = (path: string) => void;
export type NativeForegroundNotification = {
  title: string;
  body?: string;
  destination?: string | null;
};
type ShowForegroundNotification = (notification: NativeForegroundNotification) => void;

let currentToken: string | null = null;
let deviceInfoPromise: Promise<NativeAppDeviceInfo> | null = null;

const createInstallationId = () => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};

const getInstallationId = async () => {
  const stored = await Preferences.get({ key: INSTALLATION_ID_KEY });
  if (stored.value) return stored.value;
  const value = createInstallationId();
  await Preferences.set({ key: INSTALLATION_ID_KEY, value });
  return value;
};

const getDeviceInfo = () => {
  if (!deviceInfoPromise) {
    deviceInfoPromise = Promise.all([
      getInstallationId(),
      Device.getInfo(),
      CapacitorApp.getInfo(),
    ]).then(([installationId, device, app]): NativeAppDeviceInfo => {
      if (device.platform !== 'android' && device.platform !== 'ios') {
        throw new Error('A ponte nativa foi iniciada fora do Android ou iOS.');
      }
      return {
        installationId,
        platform: device.platform,
        appVersion: app.version,
        osVersion: device.osVersion,
        deviceModel: [device.manufacturer, device.model].filter(Boolean).join(' '),
        browser: device.webViewVersion || undefined,
        userAgent: navigator.userAgent,
      };
    }).catch((error) => {
      deviceInfoPromise = null;
      throw error;
    });
  }
  return deviceInfoPromise;
};

const mapPermission = (permission: string): NativePushPermission => {
  if (permission === 'granted') return 'granted';
  if (permission === 'denied') return 'denied';
  return 'not_determined';
};

const readToken = async (permissionStatus: NativePushPermission) => {
  if (permissionStatus !== 'granted' && permissionStatus !== 'provisional') return null;
  try {
    const result = await FirebaseMessaging.getToken();
    currentToken = result.token || null;
    return currentToken;
  } catch (error) {
    console.warn('O Firebase ainda não forneceu um token FCM para este aparelho.', error);
    return null;
  }
};

const getPushStatus = async (): Promise<NativePushState> => {
  const result = await FirebaseMessaging.checkPermissions();
  const permissionStatus = mapPermission(result.receive);
  return {
    permissionStatus,
    token: currentToken || await readToken(permissionStatus),
  };
};

const requestPushPermission = async (): Promise<NativePushState> => {
  const result = await FirebaseMessaging.requestPermissions();
  const permissionStatus = mapPermission(result.receive);
  return {
    permissionStatus,
    token: await readToken(permissionStatus),
  };
};

const revokePushToken = async () => {
  currentToken = null;
  const results = await Promise.allSettled([
    FirebaseMessaging.deleteToken(),
    FirebaseMessaging.removeAllDeliveredNotifications(),
  ]);
  const tokenError = results[0];
  if (tokenError.status === 'rejected') throw tokenError.reason;
};

const asData = (value: unknown): NotificationData => (
  value && typeof value === 'object' ? value as NotificationData : {}
);

const readString = (data: NotificationData, keys: string[]) => {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

/**
 * Pushes may only navigate inside the authenticated student portal. This keeps
 * untrusted notification payloads from opening arbitrary schemes or websites.
 */
export const normalizeAlunoPushDeepLink = (rawValue: string | null) => {
  if (!rawValue) return null;
  try {
    const url = new URL(rawValue, window.location.origin);
    const isWebOrigin = url.origin === window.location.origin
      || ['universocc.com.br', 'www.universocc.com.br'].includes(url.hostname);
    const isAppScheme = url.protocol === 'br.com.universocc.aluno:'
      && url.hostname === 'aluno';
    if (!isWebOrigin && !isAppScheme) return null;

    let pathname = url.pathname;
    if (isAppScheme) {
      const nativePath = pathname || '/';
      if (nativePath !== '/' && nativePath !== '/comunicacao') return null;
      pathname = `/aluno${nativePath}`;
    }
    if (pathname !== '/aluno' && !pathname.startsWith('/aluno/')) return null;
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const getNotificationDeepLink = (notification: { data?: unknown; link?: string }) => {
  const data = asData(notification.data);
  return normalizeAlunoPushDeepLink(
    readString(data, ['deep_link', 'deepLink', 'route', 'path', 'url'])
      || (typeof notification.link === 'string' ? notification.link : null),
  );
};

const bridge: UniversoNativeAppBridge = {
  getDeviceInfo,
  getPushStatus,
  requestPushPermission,
  revokePushToken,
};

const createAndroidNotificationChannels = async () => {
  if (Capacitor.getPlatform() !== 'android') return;
  const channels = [
    {
      id: 'chat',
      name: 'Conversas e atendimento',
      description: 'Novas mensagens e respostas do atendimento.',
      importance: Importance.High,
    },
    {
      id: 'financeiro',
      name: 'Avisos financeiros',
      description: 'Lembretes e atualizações de cobranças, sem dados sensíveis na tela bloqueada.',
      importance: Importance.Default,
    },
    {
      id: 'academico',
      name: 'Aulas e calendário',
      description: 'Aulas, alterações de calendário, eventos e feriados.',
      importance: Importance.Default,
    },
    {
      id: 'geral',
      name: 'Comunicados gerais',
      description: 'Comunicados institucionais do aplicativo Universo Cursos e Consultoria.',
      importance: Importance.Default,
    },
  ];
  await Promise.all(channels.map((channel) => FirebaseMessaging.createChannel({
    ...channel,
    lights: true,
    lightColor: '#2563EB',
    sound: 'default',
    vibration: true,
    visibility: Visibility.Private,
  })));
};

export const installUniversoNativeAppBridge = (
  navigate: NavigateToPushDestination,
  showForegroundNotification?: ShowForegroundNotification,
) => {
  if (!Capacitor.isNativePlatform()) return () => undefined;

  window.UniversoNativeApp = bridge;
  window.dispatchEvent(new window.CustomEvent(NATIVE_PUSH_BRIDGE_READY_EVENT));
  let disposed = false;
  const listenerHandles: Array<{ remove: () => Promise<void> }> = [];

  void createAndroidNotificationChannels().catch((error) => {
    console.warn('Não foi possível preparar os canais de notificação do Android.', error);
  });

  void FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
    if (disposed || !token) return;
    currentToken = token;
    window.dispatchEvent(new window.CustomEvent(NATIVE_PUSH_TOKEN_CHANGED_EVENT, {
      detail: { token },
    }));
  }).then((handle) => listenerHandles.push(handle)).catch((error) => {
    console.warn('Não foi possível acompanhar a renovação do token FCM.', error);
  });

  void FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
    if (disposed) return;
    const destination = getNotificationDeepLink(notification);
    if (destination) navigate(destination);
  }).then((handle) => listenerHandles.push(handle)).catch((error) => {
    console.warn('Não foi possível acompanhar a abertura das notificações.', error);
  });

  void FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
    if (disposed || !showForegroundNotification) return;
    showForegroundNotification({
      title: notification.title?.trim() || 'Universo Cursos e Consultoria',
      body: notification.body?.trim() || undefined,
      destination: getNotificationDeepLink(notification),
    });
  }).then((handle) => listenerHandles.push(handle)).catch((error) => {
    console.warn('Não foi possível acompanhar notificações recebidas com o app aberto.', error);
  });

  void CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    if (disposed) return;
    const destination = normalizeAlunoPushDeepLink(url);
    if (destination) navigate(destination);
  }).then((handle) => listenerHandles.push(handle)).catch((error) => {
    console.warn('Não foi possível acompanhar links externos do aplicativo.', error);
  });

  void CapacitorApp.getLaunchUrl().then((launch) => {
    if (disposed || !launch?.url) return;
    const destination = normalizeAlunoPushDeepLink(launch.url);
    if (destination) navigate(destination);
  }).catch((error) => {
    console.warn('Não foi possível processar o link que abriu o aplicativo.', error);
  });

  return () => {
    disposed = true;
    if (window.UniversoNativeApp === bridge) delete window.UniversoNativeApp;
    for (const handle of listenerHandles) void handle.remove();
  };
};

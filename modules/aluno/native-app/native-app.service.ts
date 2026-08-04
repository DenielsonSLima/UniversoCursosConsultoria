import { supabase } from '../../../lib/supabase';
import { Preferences } from '@capacitor/preferences';
import type {
  AlunoAppDeviceStatus,
  NativeAppDeviceInfo,
  NativePushPermission,
  NativePushState,
  UniversoNativeAppBridge,
} from './native-app.types';

type DeviceStatusRow = {
  device_id: string;
  plataforma?: 'android' | 'ios';
  permission_status: NativePushPermission;
  notifications_enabled: boolean;
  session_active: boolean;
  app_version?: string | null;
  installed_at?: string;
  last_seen_at: string;
};

export type PublicPushRegistration = {
  installationId: string;
  platform: 'android' | 'ios';
  pushToken: string;
  permissionStatus: 'granted' | 'provisional';
};

let deviceInfoPromise: Promise<NativeAppDeviceInfo> | null = null;
const NOTIFICATIONS_DISABLED_BY_USER_KEY = 'universo.native.notifications-disabled-by-user-v1';

const notificationsWereDisabledInApp = async () => (
  (await Preferences.get({ key: NOTIFICATIONS_DISABLED_BY_USER_KEY })).value === 'true'
);

const getBridge = (): UniversoNativeAppBridge | null => {
  if (typeof window === 'undefined') return null;
  const bridge = window.UniversoNativeApp;
  if (!bridge?.getDeviceInfo || !bridge.getPushStatus || !bridge.requestPushPermission || !bridge.revokePushToken) return null;
  return bridge;
};

const getDeviceInfo = async () => {
  const bridge = getBridge();
  if (!bridge) return null;
  if (!deviceInfoPromise) {
    deviceInfoPromise = bridge.getDeviceInfo().then((device) => {
      if (!device.installationId || !['android', 'ios'].includes(device.platform)) {
        throw new Error('O aplicativo não forneceu uma identificação de dispositivo válida.');
      }
      return device;
    }).catch((error) => {
      deviceInfoPromise = null;
      throw error;
    });
  }
  return deviceInfoPromise;
};

const mapStatus = (row: DeviceStatusRow, fallbackPlatform?: 'android' | 'ios'): AlunoAppDeviceStatus => ({
  deviceId: row.device_id,
  platform: row.plataforma || fallbackPlatform || 'android',
  permissionStatus: row.permission_status,
  notificationsEnabled: row.notifications_enabled,
  sessionActive: row.session_active,
  appVersion: row.app_version || null,
  installedAt: row.installed_at || row.last_seen_at,
  lastSeenAt: row.last_seen_at,
});

const register = async (): Promise<AlunoAppDeviceStatus | null> => {
  const bridge = getBridge();
  const device = await getDeviceInfo();
  if (!bridge || !device) return null;
  const push = await bridge.getPushStatus();
  const { data, error } = await (supabase.rpc as any)('register_aluno_app_device', {
    p_installation_id: device.installationId,
    p_plataforma: device.platform,
    p_permission_status: push.permissionStatus,
    p_push_token: push.token || null,
    p_app_version: device.appVersion || null,
    p_os_version: device.osVersion || null,
    p_device_model: device.deviceModel || null,
    p_browser: device.browser || null,
    p_user_agent: device.userAgent || null,
  });
  if (error) throw error;
  const row = (data as DeviceStatusRow[] | null)?.[0];
  const status = row ? mapStatus(row, device.platform) : null;
  const canEnable = ['granted', 'provisional'].includes(push.permissionStatus) && Boolean(push.token);
  if (status && canEnable && !status.notificationsEnabled && !await notificationsWereDisabledInApp()) {
    return setConsent(push, true);
  }
  return status;
};

const getStatus = async (): Promise<AlunoAppDeviceStatus | null> => {
  const device = await getDeviceInfo();
  if (!device) return null;
  const { data, error } = await (supabase.rpc as any)('get_aluno_app_device_status', {
    p_installation_id: device.installationId,
  });
  if (error) throw error;
  const row = (data as DeviceStatusRow[] | null)?.[0];
  return row ? mapStatus(row, device.platform) : register();
};

const setConsent = async (push: NativePushState, enabled: boolean) => {
  const device = await getDeviceInfo();
  if (!device) throw new Error('Este recurso está disponível somente no aplicativo Universo Cursos e Consultoria.');
  const { data, error } = await (supabase.rpc as any)('set_aluno_app_notification_consent', {
    p_installation_id: device.installationId,
    p_permission_status: push.permissionStatus,
    p_enabled: enabled,
    p_push_token: push.token || null,
  });
  if (error) throw error;
  const row = (data as DeviceStatusRow[] | null)?.[0];
  return row ? mapStatus(row, device.platform) : null;
};

export const nativeAppService = {
  isAvailable: () => Boolean(getBridge()),
  async getGlobalPushStatus() {
    const bridge = getBridge();
    return bridge ? bridge.getPushStatus() : null;
  },
  async getPublicPushRegistration(): Promise<PublicPushRegistration | null> {
    const bridge = getBridge();
    const device = await getDeviceInfo();
    if (!bridge || !device) return null;
    const push = await bridge.getPushStatus();
    if (!['granted', 'provisional'].includes(push.permissionStatus) || !push.token) return null;
    return {
      installationId: device.installationId,
      platform: device.platform,
      pushToken: push.token,
      permissionStatus: push.permissionStatus as 'granted' | 'provisional',
    };
  },
  register,
  getStatus,
  async touch() {
    const device = await getDeviceInfo();
    if (!device) return false;
    const { data, error } = await (supabase.rpc as any)('touch_aluno_app_device', {
      p_installation_id: device.installationId,
    });
    if (error) throw error;
    return Boolean(data);
  },
  async requestNotificationPermission() {
    const bridge = getBridge();
    if (!bridge) throw new Error('Este recurso está disponível somente no aplicativo Universo Cursos e Consultoria.');
    const push = await bridge.requestPushPermission();
    await Preferences.remove({ key: NOTIFICATIONS_DISABLED_BY_USER_KEY });
    return setConsent(push, ['granted', 'provisional'].includes(push.permissionStatus) && Boolean(push.token));
  },
  async disableNotifications() {
    const bridge = getBridge();
    if (!bridge) return null;
    const push = await bridge.getPushStatus();
    await Preferences.set({ key: NOTIFICATIONS_DISABLED_BY_USER_KEY, value: 'true' });
    return setConsent(push, false);
  },
  async openSettings() {
    const bridge = getBridge();
    if (bridge?.openNotificationSettings) await bridge.openNotificationSettings();
  },
  async logout() {
    const bridge = getBridge();
    if (!bridge) return false;

    // Start the local revocation before any network request. The portal only
    // waits a few seconds before ending the Supabase session, so a stalled RPC
    // must never keep the previous account's FCM token active on this device.
    const localRevocation = bridge.revokePushToken().catch((error) => {
      console.warn('O token FCM local não pôde ser removido durante o logout.', error);
    });
    const device = await getDeviceInfo();
    if (!device) {
      await localRevocation;
      return false;
    }

    const serverLogout = (async () => {
      const { data, error } = await (supabase.rpc as any)('logout_aluno_app_device', {
        p_installation_id: device.installationId,
      });
      if (error) throw error;
      return Boolean(data);
    })();

    const [serverResult] = await Promise.all([serverLogout, localRevocation]);
    return serverResult;
  },
};

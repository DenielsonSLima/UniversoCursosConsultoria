export type NativeAppPlatform = 'android' | 'ios';
export type NativePushPermission = 'not_determined' | 'granted' | 'denied' | 'provisional';

export interface NativeAppDeviceInfo {
  installationId: string;
  platform: NativeAppPlatform;
  appVersion?: string;
  osVersion?: string;
  deviceModel?: string;
  browser?: string;
  userAgent?: string;
}

export interface NativePushState {
  permissionStatus: NativePushPermission;
  token?: string | null;
}

export interface UniversoNativeAppBridge {
  getDeviceInfo: () => Promise<NativeAppDeviceInfo>;
  getPushStatus: () => Promise<NativePushState>;
  requestPushPermission: () => Promise<NativePushState>;
  revokePushToken: () => Promise<void>;
  openNotificationSettings?: () => Promise<void>;
}

export interface AlunoAppDeviceStatus {
  deviceId: string;
  platform: NativeAppPlatform;
  permissionStatus: NativePushPermission;
  notificationsEnabled: boolean;
  sessionActive: boolean;
  appVersion: string | null;
  installedAt: string;
  lastSeenAt: string;
}

declare global {
  // A interface global e consumida pelo runtime nativo que injeta a ponte.
  // eslint-disable-next-line no-unused-vars
  interface Window {
    UniversoNativeApp?: UniversoNativeAppBridge;
  }
}

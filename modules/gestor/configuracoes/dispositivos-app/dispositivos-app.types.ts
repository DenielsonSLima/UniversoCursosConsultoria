export type AppDeviceStatusFilter =
  | 'all'
  | 'installed'
  | 'not_installed'
  | 'online'
  | 'offline'
  | 'notifications'
  | 'no_notifications';

export interface AppDeviceUser {
  alunoId: string;
  nome: string;
  matricula: string | null;
  email: string | null;
  poloId: string | null;
  poloNome: string | null;
  poloCidade: string | null;
  poloUf: string | null;
  appInstalled: boolean;
  sessionActive: boolean;
  onlineNow: boolean;
  notificationActive: boolean;
  plataformas: Array<'android' | 'ios'>;
  deviceCount: number;
  permissionStatus: 'not_determined' | 'granted' | 'denied' | 'provisional';
  installedAt: string | null;
  lastSeenAt: string | null;
  appVersion: string | null;
  totalCount: number;
}

export interface AppDevicesSummary {
  totalAlunos: number;
  appInstalado: number;
  onlineAgora: number;
  notificacoesAtivas: number;
}

export interface AppDevicePolo {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
}

export interface AppDeviceDetail {
  id: string;
  platform: 'android' | 'ios';
  permissionStatus: AppDeviceUser['permissionStatus'];
  notificationsEnabled: boolean;
  sessionActive: boolean;
  active: boolean;
  appVersion: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  installedAt: string;
  lastSeenAt: string;
  lastAuthenticatedAt: string | null;
  consentAt: string | null;
  consentRevokedAt: string | null;
  loggedOutAt: string | null;
}

export interface AppDeviceStudentDetail {
  alunoId: string;
  nome: string;
  matricula: string | null;
  email: string | null;
  poloId: string | null;
  poloNome: string | null;
  poloCidade: string | null;
  poloUf: string | null;
  dispositivos: AppDeviceDetail[];
}

export interface AppDeviceAuditEvent {
  id: number;
  deviceId: string;
  event: 'installed' | 'session' | 'permission' | 'device';
  platform: 'android' | 'ios';
  permissionStatus: AppDeviceUser['permissionStatus'] | null;
  notificationsEnabled: boolean | null;
  sessionActive: boolean | null;
  deviceActive: boolean | null;
  appVersion: string | null;
  deviceModel: string | null;
  createdAt: string;
}

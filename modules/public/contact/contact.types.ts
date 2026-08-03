export interface PublicUnitScheduleDay {
  ativo: boolean;
  inicio: string;
  fim: string;
}

export type PublicUnitSchedule = Record<string, PublicUnitScheduleDay>;

export interface PublicUnit {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  isMatrix: boolean;
  supportHours: PublicUnitSchedule | null;
}

import { supabase } from '../../../lib/supabase';

export interface EadCertificateDeliveryState {
  allowed: boolean;
  deadline: string | null;
  state: 'TEMPORARY' | 'DEFINITIVE' | 'REVOKED';
  code: string;
}

export const parseEadCertificateDeliveryState = (value: unknown): EadCertificateDeliveryState => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Não foi possível confirmar a liberação do certificado.');
  const row = value as Record<string, unknown>;
  if (typeof row.allowed !== 'boolean' || typeof row.code !== 'string'
    || !['TEMPORARY', 'DEFINITIVE', 'REVOKED'].includes(String(row.state))
    || !(row.deadline === null || typeof row.deadline === 'string')
    || (row.state === 'TEMPORARY' && (typeof row.deadline !== 'string' || !Number.isFinite(Date.parse(row.deadline))))
    || (row.state === 'DEFINITIVE' && row.deadline !== null)
    || (row.state === 'REVOKED' && row.allowed)) {
    throw new Error('Não foi possível confirmar a liberação do certificado.');
  }
  return { allowed: row.allowed, deadline: row.deadline, state: row.state, code: row.code } as EadCertificateDeliveryState;
};

export const isEadCertificateDeliveryAllowed = (
  value: EadCertificateDeliveryState | undefined, expectedCode: string, now = Date.now(),
) => Boolean(value?.allowed && expectedCode && value.code === expectedCode
  && (value.state === 'DEFINITIVE' || (value.state === 'TEMPORARY' && Date.parse(value.deadline || '') > now)));

export const eadCertificateDeliveryService = {
  async get(certificateId: string, signal?: AbortSignal): Promise<EadCertificateDeliveryState> {
    let request = supabase.rpc('ead_get_certificate_delivery_state', { p_certificado_id: certificateId });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw new Error('Não foi possível conferir a liberação do certificado. Tente novamente.', { cause: error });
    return parseEadCertificateDeliveryState(data);
  },
};

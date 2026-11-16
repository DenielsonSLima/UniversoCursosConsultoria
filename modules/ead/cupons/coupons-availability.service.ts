import { supabase } from '../../../lib/supabase';
import { assertEadCouponsEnvironment } from './coupons-environment';

export const getEadCouponsAvailability = async (signal?: AbortSignal): Promise<boolean> => {
  assertEadCouponsEnvironment();
  const request = supabase.rpc('ead_coupons_available');
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  if (error) throw Object.assign(new Error(error.message || 'Não foi possível conferir os cupons.'), { code: error.code });
  return data === true;
};

export const shouldRetryEadCouponsAvailability = (failureCount: number, error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return failureCount < 1 && !['PGRST202', '42883', '42501'].includes(code || '');
};

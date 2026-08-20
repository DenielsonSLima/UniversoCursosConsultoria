import { supabase } from '../../../lib/supabase';
import { DocumentValidationResult } from './validator.types';
import { mapCanonicalValidationRecord } from './validator.mapper';
import { normalizePublicValidationCode } from './validator-page.flow';

const validateEmissionRegistry = async (
  code: string
): Promise<DocumentValidationResult | null> => {
  const { data: rpcRecord, error: rpcError } = await supabase.rpc(
    'validar_documento_por_codigo',
    { p_codigo: code }
  );

  if (rpcError) throw rpcError;
  return mapCanonicalValidationRecord(rpcRecord, code);
};

const SIGNATURE_CODE_PATTERN =
  /^SIG-[0-9A-F]{8}-[0-9A-F]{4}-[1-5][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/u;

const validateSignatureEvent = async (
  code: string,
): Promise<DocumentValidationResult | null> => {
  const { data: rpcRecord, error: rpcError } = await supabase.rpc(
    'validar_assinatura_eletronica_por_codigo',
    { p_codigo: code },
  );

  if (rpcError) throw rpcError;
  return mapCanonicalValidationRecord(rpcRecord, code);
};

export const validatorService = {
  async validate(rawCode: string): Promise<DocumentValidationResult | null> {
    const code = normalizePublicValidationCode(rawCode);
    if (code.length < 5) return null;

    if (code.startsWith('SIG-')) {
      return SIGNATURE_CODE_PATTERN.test(code)
        ? validateSignatureEvent(code)
        : null;
    }

    return validateEmissionRegistry(code);
  },
};

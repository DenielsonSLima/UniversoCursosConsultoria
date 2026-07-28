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

export const validatorService = {
  async validate(rawCode: string): Promise<DocumentValidationResult | null> {
    const code = normalizePublicValidationCode(rawCode);
    if (code.length < 5) return null;

    return validateEmissionRegistry(code);
  },
};

import { supabase } from '../../../lib/supabase';

const readFunctionError = async (error: unknown) => {
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return body?.error || (error instanceof Error ? error.message : 'Não foi possível gerar o boleto Banese.');
};

export const fetchBaneseBoletoDocument = async (receivableId: string) => {
  if (!receivableId) {
    throw new Error('A cobrança não retornou o identificador necessário para gerar o boleto.');
  }

  const { data, error } = await supabase.functions.invoke<Blob>('banese-boleto-document', {
    body: { receivableId },
  });
  if (error) throw new Error(await readFunctionError(error));
  if (!(data instanceof Blob) || data.type !== 'application/pdf') {
    throw new Error('O servidor não retornou um PDF Banese válido.');
  }
  return data;
};


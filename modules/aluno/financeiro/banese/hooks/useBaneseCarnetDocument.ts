import { useMutation } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';

const readFunctionError = async (error: unknown) => {
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return body?.error || (error instanceof Error ? error.message : 'Não foi possível gerar o carnê Banese.');
};

const saveCarnet = (document: Blob) => {
  const url = URL.createObjectURL(document);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = 'carne-completo-banese.pdf';
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

const useBaneseCarnetDocument = (receivableId: string, enabled: boolean) => {
  const mutation = useMutation<Blob, Error, void>({
    mutationFn: async () => {
      if (!enabled || !receivableId) {
        throw new Error('Este pagamento não possui um carnê Banese disponível.');
      }
      const { data, error } = await supabase.functions.invoke<Blob>('banese-carnet-document', {
        body: { receivableId },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (!(data instanceof Blob) || !data.type.startsWith('application/pdf')) {
        throw new Error('O servidor não retornou um carnê Banese válido.');
      }
      return data;
    },
  });

  const download = () => {
    if (!enabled || mutation.isPending) return;
    mutation.mutate(undefined, { onSuccess: saveCarnet });
  };

  return {
    download,
    isDownloading: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
};

export default useBaneseCarnetDocument;

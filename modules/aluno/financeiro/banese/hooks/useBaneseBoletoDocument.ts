import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';

const readFunctionError = async (error: unknown) => {
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return body?.error || (error instanceof Error ? error.message : 'Não foi possível gerar o boleto Banese.');
};

const useBaneseBoletoDocument = (receivableId: string, enabled = true) => {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const query = useQuery<Blob>({
    queryKey: ['banese-boleto-document', receivableId],
    enabled: enabled && Boolean(receivableId),
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<Blob>('banese-boleto-document', {
        body: { receivableId },
      });
      if (error) throw new Error(await readFunctionError(error));
      if (!(data instanceof Blob) || data.type !== 'application/pdf') {
        throw new Error('O servidor não retornou um PDF Banese válido.');
      }
      return data;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!query.data) {
      setDocumentUrl(null);
      return undefined;
    }
    const nextUrl = URL.createObjectURL(query.data);
    setDocumentUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [query.data]);

  const download = () => {
    if (!documentUrl) return;
    const link = document.createElement('a');
    link.href = documentUrl;
    link.download = `boleto-banese-${receivableId}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return {
    documentUrl,
    isLoading: query.isLoading || (query.isSuccess && !documentUrl),
    error: query.error instanceof Error ? query.error.message : null,
    retry: query.refetch,
    download,
  };
};

export default useBaneseBoletoDocument;

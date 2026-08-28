import { supabase } from '../../../../lib/supabase';
import { parseDocumentGroupsResponse } from './carnes-alunos.contract';
import { buildBaneseDocumentFileName, combineVectorPdfBlobs } from './carnes-alunos.pdf';
import {
  assertVectorPdfByteLimit,
  buildDocumentRequests,
} from './carnes-alunos.selection';
import type {
  BaneseDocumentGroup,
  BaneseDocumentGroupsRequest,
  BaneseDocumentGroupsResponse,
  BaneseDocumentProgress,
  PreparedBaneseDocument,
} from './carnes-alunos.types';

const readFunctionError = async (error: unknown, fallback: string) => {
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return body?.error || (error instanceof Error ? error.message : fallback);
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const failure = new Error('A preparação dos documentos foi cancelada.');
  failure.name = 'AbortError';
  throw failure;
};

const invokeDocument = async (
  functionName: 'banese-carnet-document' | 'banese-boleto-document',
  receivableId: string,
  signal?: AbortSignal,
) => {
  throwIfAborted(signal);
  const { data, error } = await supabase.functions.invoke<Blob>(functionName, {
    body: { receivableId },
    signal,
  });
  throwIfAborted(signal);
  if (error) {
    throw new Error(await readFunctionError(error, 'Não foi possível montar o documento Banese.'));
  }
  if (!(data instanceof Blob) || data.type.toLowerCase() !== 'application/pdf') {
    throw new Error('O servidor não retornou um PDF Banese válido.');
  }
  return data;
};

const invokeDocumentsWithBoundedConcurrency = async (
  requests: ReturnType<typeof buildDocumentRequests>,
  onProgress?: (progress: BaneseDocumentProgress) => void,
  signal?: AbortSignal,
) => {
  const documents = new Array<Blob>(requests.length);
  let nextIndex = 0;
  let completed = 0;
  let receivedBytes = 0;
  let firstFailure: unknown = null;
  const worker = async () => {
    while (!firstFailure && !signal?.aborted && nextIndex < requests.length) {
      const index = nextIndex;
      nextIndex += 1;
      const request = requests[index];
      try {
        const document = await invokeDocument(
          request.functionName,
          request.receivableId,
          signal,
        );
        receivedBytes = assertVectorPdfByteLimit(receivedBytes + document.size);
        documents[index] = document;
      } catch (failure) {
        firstFailure ||= failure;
      } finally {
        completed += 1;
        onProgress?.({ current: completed, total: requests.length });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(4, requests.length) }, () => worker()),
  );
  throwIfAborted(signal);
  if (firstFailure) throw firstFailure;
  return documents;
};

export const carnesAlunosService = {
  async listGroups(
    request: BaneseDocumentGroupsRequest,
    signal?: AbortSignal,
  ): Promise<BaneseDocumentGroupsResponse> {
    throwIfAborted(signal);
    const { data, error } = await supabase.functions.invoke(
      'secretaria-banese-document-groups',
      { body: request, signal },
    );
    if (error) {
      throw new Error(await readFunctionError(error, 'Não foi possível consultar os carnês dos alunos.'));
    }
    return parseDocumentGroupsResponse(data);
  },

  async prepareDocument(
    groups: BaneseDocumentGroup[],
    onProgress?: (progress: BaneseDocumentProgress) => void,
    signal?: AbortSignal,
  ): Promise<PreparedBaneseDocument> {
    throwIfAborted(signal);
    const requests = buildDocumentRequests(groups);
    onProgress?.({ current: 0, total: requests.length });
    const documents = await invokeDocumentsWithBoundedConcurrency(
      requests,
      onProgress,
      signal,
    );
    throwIfAborted(signal);
    return {
      blob: await combineVectorPdfBlobs(documents, signal),
      fileName: buildBaneseDocumentFileName(groups),
      groups: [...groups],
      requestCount: requests.length,
    };
  },
};

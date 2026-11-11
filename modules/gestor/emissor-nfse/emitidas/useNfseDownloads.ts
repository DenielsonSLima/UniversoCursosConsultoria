import { useEffect, useRef, useState } from 'react';
import type { NfseDocument, NfseScope } from '../types/nfse.types';
import { isNfseScopeValid } from '../types/nfse.scope';
import type { NfseDownloadFormat, NfseDownloadProgress } from './nfse-download.core';
import { useQueryClient } from '@tanstack/react-query';
import { resolveNfseIssuedDocument } from '../visualizador/services/nfse-issued-presentation';

export function useNfseDownloads(scope: NfseScope | null, canRead: boolean) {
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const scopeKey = JSON.stringify(scope);
  const currentAccess = useRef({ scopeKey, canRead });
  currentAccess.current = { scopeKey, canRead };
  useEffect(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setMessage('');
    setError('');
    return () => { generation.current++; controller.current?.abort(); };
  }, [scopeKey, canRead]);

  const start = async (documents: NfseDocument[], format: NfseDownloadFormat, archive: boolean) => {
    if (controller.current || !canRead || !isNfseScopeValid(scope)) return;
    const captured = { ...scope };
    const selection = documents.map(document => ({ ...document }));
    const operation = new AbortController();
    const current = generation.current;
    controller.current = operation;
    setBusy(true);
    setError('');
    setMessage('Preparando download…');
    try {
      if (!archive && selection.length !== 1) throw new Error('Selecione uma nota para baixar.');
      const { createNfseZip, createNfseDownloadFile, downloadNfseFile } = await import('./nfse-download.service');
      operation.signal.throwIfAborted();
      const progress = (value: NfseDownloadProgress) => {
        if (!operation.signal.aborted && current === generation.current) setMessage(value.phase === 'zip'
          ? 'Compactando ZIP…' : `Preparando arquivos: ${value.completed} de ${value.total}`);
      };
      const resolveIdentity = (identity: Pick<NfseDocument, 'id' | 'accessKey' | 'number'>) => {
        const selected = selection.find(item => item.id === identity.id && item.accessKey === identity.accessKey && item.number === identity.number);
        const current = selected && resolveNfseIssuedDocument(client, captured, selected);
        if (!current || !currentAccess.current.canRead || currentAccess.current.scopeKey !== JSON.stringify(captured)) throw new Error('A consulta fiscal mudou. Atualize a lista antes de baixar.');
        return current;
      };
      const file = archive ? await createNfseZip(captured, selection, format, operation.signal, progress, resolveIdentity)
        : await createNfseDownloadFile(captured, selection[0], format, operation.signal, resolveIdentity);
      operation.signal.throwIfAborted();
      if (current !== generation.current || !currentAccess.current.canRead
        || currentAccess.current.scopeKey !== JSON.stringify(captured)) return;
      downloadNfseFile(file, operation.signal);
      setMessage(archive ? 'ZIP pronto para download.' : 'Arquivo pronto para download.');
    } catch (cause) {
      if (current === generation.current) {
        if (operation.signal.aborted) setMessage('Download cancelado.');
        else { setMessage(''); setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o download.'); }
      }
    } finally {
      if (controller.current === operation) { controller.current = null; if (current === generation.current) setBusy(false); }
    }
  };
  return { busy, message, error, cancel: () => controller.current?.abort(),
    download: (documents: NfseDocument[], format: NfseDownloadFormat, archive = false) => void start(documents, format, archive) };
}

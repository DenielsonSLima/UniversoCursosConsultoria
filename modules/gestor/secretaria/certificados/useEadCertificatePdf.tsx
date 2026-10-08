import React, { useEffect, useMemo, useRef, useState } from 'react';
import CertificadoPreview from './components/CertificadoPreview';
import type { CertificadoAcademico } from './certificados.types';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { buildEadCertificatePdf } from './ead-certificate-pdf';
import { printPdfBlob } from '../shared/pdf-blob-print';

type PdfResult = { key: object; blob: Blob; url: string };

export function useEadCertificatePdf(certificate: CertificadoAcademico | null,
  model: any, enabled: boolean, showValidationQrCode = true) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<PdfResult | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [printing, setPrinting] = useState(false);
  const [retry, setRetry] = useState(0);
  const key = useMemo(() => enabled && certificate && model ? {} : null,
    [enabled, certificate, model, showValidationQrCode, retry]);
  const current = result?.key === key ? result : null;

  useEffect(() => {
    if (!key) { setResult(null); setError(''); return; }
    let active = true;
    let objectUrl = '';
    setError('');
    setActionError('');
    void (async () => {
      if (!sourceRef.current) throw new Error('A prévia do certificado está indisponível.');
      const blob = await buildEadCertificatePdf(sourceRef.current);
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setResult({ key, blob, url: objectUrl });
    })().catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o certificado em PDF.');
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  const fileName = `certificado-${certificate?.codigo_validacao || 'ead'}.pdf`;
  const download = () => { if (current) downloadPdfBlob(current.blob, fileName); };
  const print = async () => {
    if (!current || printing) return;
    setPrinting(true);
    setActionError('');
    try {
      await printPdfBlob(current.blob, { title: 'Impressão do certificado EAD' });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'Não foi possível imprimir o certificado.');
    } finally {
      setPrinting(false);
    }
  };

  const source = key && certificate ? (
    <div aria-hidden="true" data-ead-certificate-pdf-source style={{
      position: 'fixed', left: -20000, top: 0, width: '297mm', zIndex: -1, pointerEvents: 'none',
    }}><div ref={sourceRef}><CertificadoPreview certificado={certificate} modelo={model}
      pdfMode showValidationQrCode={showValidationQrCode} /></div></div>
  ) : null;

  return { source, blob: current?.blob || null, url: current?.url || '', error, actionError, printing,
    loading: Boolean(key && !current && !error), ready: Boolean(current),
    retry: () => setRetry(value => value + 1), download, print };
}

export const EadCertificatePdfView: React.FC<{ url: string; loading: boolean; error: string; actionError?: string; retry: () => void }> = ({ url, loading, error, actionError, retry }) => (
  <div data-ead-certificate-pdf-state={error ? 'error' : loading ? 'loading' : url ? 'ready' : 'idle'}>
    {actionError && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-4 text-red-800">{actionError}</p>}
    {error ? <div role="alert" className="rounded-2xl bg-red-50 p-6 text-red-800">
      <p>{error}</p><button type="button" onClick={retry} className="mt-4 rounded-xl bg-red-700 px-5 py-3 font-bold text-white">Tentar novamente</button>
    </div> : loading ? <div role="status" className="rounded-2xl bg-white p-10 text-center text-slate-600">Preparando o certificado em PDF...</div>
      : url ? <iframe data-ead-certificate-pdf-preview title="Prévia do certificado EAD em PDF"
        src={url} className="w-full rounded-xl border-0 bg-white" style={{ height: '78vh', minHeight: 420 }} /> : null}
  </div>
);

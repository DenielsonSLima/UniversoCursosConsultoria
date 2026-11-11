import { Download, FileCode, FileSearch } from 'lucide-react';
interface Props { number: string | null; disabled: boolean; onPreview: () => void; onPdf: () => void; onXml: () => void }
export default function NfseDocumentActions({ number, disabled, onPreview, onPdf, onXml }: Props) {
  return <div className="nfse-issued-note-actions" aria-label={`Ações da NFS-e ${number ?? ''}`}>
    <button type="button" className="nfse-button nfse-button-secondary" disabled={disabled} onClick={onPreview}><FileSearch size={15} />Visualizar</button>
    <button type="button" className="nfse-button nfse-button-secondary" disabled={disabled} onClick={onPdf}><Download size={15} />PDF</button>
    <button type="button" className="nfse-button nfse-button-secondary" disabled={disabled} onClick={onXml}><FileCode size={15} />XML</button>
  </div>;
}

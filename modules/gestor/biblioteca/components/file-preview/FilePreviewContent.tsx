import React, { useState } from 'react';
import { AlertCircle, Cloud, Download, FileText } from 'lucide-react';
import { LibraryDocument } from '../../biblioteca.types';
import LibraryFileIcon from './LibraryFileIcon';
import PdfCanvasPreview from './PdfCanvasPreview';
import {
  buildOfficeViewerUrl,
  FilePreviewKind,
  getFileTypeLabel,
  isPublicHttpUrl,
  resolvePreviewKind
} from './filePreview.utils';

interface FilePreviewContentProps {
  file: LibraryDocument;
  renderAllPdfPages?: boolean;
  onPdfReadyChange?: (ready: boolean) => void;
  onPdfError?: () => void;
}

const EmptyPreview: React.FC<{
  kind: FilePreviewKind;
  title: string;
  description: string;
}> = ({ kind, title, description }) => (
  <div className="flex h-full min-h-[420px] flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#f8fbff_0%,#eef3f8_70%)] px-6 text-center">
    <LibraryFileIcon kind={kind} size="lg" />
    <h4 className="mt-5 text-sm font-black uppercase tracking-[0.08em] text-[#001a33]">{title}</h4>
    <p className="mt-2 max-w-md text-xs font-medium leading-relaxed text-slate-500">{description}</p>
  </div>
);

const FilePreviewContent: React.FC<FilePreviewContentProps> = ({
  file,
  renderAllPdfPages = false,
  onPdfReadyChange,
  onPdfError,
}) => {
  const [pdfFailed, setPdfFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const url = `${file.url || ''}`.trim();
  const kind = resolvePreviewKind(file.fileType, file.title, url);
  const hasPublicUrl = isPublicHttpUrl(url);

  if (!hasPublicUrl) {
    return (
      <EmptyPreview
        kind={kind}
        title="Pré-visualização indisponível"
        description="O arquivo não possui um endereço válido para abrir no visualizador. Envie o documento novamente ou use uma cópia publicada no acervo."
      />
    );
  }

  if (kind === 'IMG') {
    if (imageFailed) {
      return (
        <EmptyPreview
          kind={kind}
          title="A imagem não pôde ser carregada"
          description="Confira sua conexão ou use o botão de download para abrir o arquivo no seu dispositivo."
        />
      );
    }

    return (
      <div className="library-image-preview flex h-full min-h-[420px] items-center justify-center bg-[linear-gradient(145deg,#0f172a,#020617)] p-4 md:p-8">
        <img
          src={url}
          alt={file.title}
          onError={() => setImageFailed(true)}
          className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        />
      </div>
    );
  }

  if (kind === 'PDF') {
    if (pdfFailed) {
      return (
        <EmptyPreview
          kind={kind}
          title="O PDF não pôde ser carregado"
          description="Confira sua conexão ou use o botão de download para abrir o arquivo no leitor do seu dispositivo."
        />
      );
    }

    return (
      <PdfCanvasPreview
        key={url}
        url={url}
        title={file.title}
        onError={() => {
          setPdfFailed(true);
          onPdfError?.();
        }}
        onReadyChange={onPdfReadyChange}
        renderAllPages={renderAllPdfPages}
      />
    );
  }

  if (kind === 'VIDEO') {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center bg-slate-950 p-4 md:p-8">
        <video src={url} controls playsInline className="max-h-full max-w-full rounded-xl shadow-2xl">
          Seu navegador não oferece suporte à reprodução deste vídeo.
        </video>
      </div>
    );
  }

  if (kind === 'DOC' || kind === 'XLS' || kind === 'PPT') {
    return (
      <div className="relative h-full min-h-[520px] bg-slate-100">
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur">
          <Cloud size={12} className="text-blue-600" />
          Visualização {getFileTypeLabel(kind)} pelo Microsoft 365
        </div>
        <iframe
          src={buildOfficeViewerUrl(url)}
          title={`Pré-visualização de ${file.title}`}
          className="h-full min-h-[520px] w-full border-0 bg-white"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center bg-amber-50 p-8 text-center text-amber-900">
      <AlertCircle size={38} className="text-amber-500" />
      <h4 className="mt-4 text-sm font-black uppercase tracking-wider">Formato sem preview</h4>
      <p className="mt-2 max-w-sm text-xs leading-relaxed">
        Este tipo de arquivo ainda não pode ser aberto dentro do sistema. Faça o download para usar o aplicativo apropriado.
      </p>
      <a
        href={url}
        download={file.title}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white transition-colors hover:bg-amber-700"
      >
        <Download size={14} />
        Baixar arquivo
      </a>
      <FileText size={18} className="mt-6 text-amber-300" />
    </div>
  );
};

export default FilePreviewContent;

import React, { useState } from 'react';
import { LibraryDocument } from '../../biblioteca.types';
import LibraryFileIcon from './LibraryFileIcon';
import PdfCanvasPreview from './PdfCanvasPreview';
import { isPublicHttpUrl, resolvePreviewKind } from './filePreview.utils';

interface LibraryFileThumbnailProps {
  file: Pick<LibraryDocument, 'fileType' | 'title' | 'url'>;
  className?: string;
}

const LibraryFileThumbnail: React.FC<LibraryFileThumbnailProps> = ({
  file,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const kind = resolvePreviewKind(file.fileType, file.title, file.url);
  const canPreview = isPublicHttpUrl(file.url);
  const showImage = kind === 'IMG' && canPreview && !failed;
  const showPdf = kind === 'PDF' && canPreview && !failed;

  return (
    <div
      className={`relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-[linear-gradient(145deg,#f8fafc,#eef2f7)] shadow-sm ${className}`}
    >
      {showImage && (
        <img
          src={file.url}
          alt={`Miniatura de ${file.title}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      )}

      {showPdf && (
        <PdfCanvasPreview
          url={file.url}
          title={file.title}
          mode="thumbnail"
          onError={() => setFailed(true)}
        />
      )}

      {!showImage && !showPdf && (
        <LibraryFileIcon kind={kind} size="lg" />
      )}

      <span className="absolute bottom-1.5 right-1.5 rounded-md border border-white/70 bg-[#001a33]/85 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-white shadow-sm backdrop-blur">
        {kind}
      </span>
    </div>
  );
};

export default LibraryFileThumbnail;

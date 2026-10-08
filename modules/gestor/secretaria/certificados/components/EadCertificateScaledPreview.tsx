import React, { useLayoutEffect, useRef, useState } from 'react';

const A4_LANDSCAPE_WIDTH = 297 * 96 / 25.4;

const EadCertificateScaledPreview: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState({ scale: 1, height: 0 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const document = documentRef.current;
    if (!viewport || !document) return;
    const measure = () => {
      const scale = Math.min(1, viewport.clientWidth / A4_LANDSCAPE_WIDTH);
      const height = document.scrollHeight;
      setGeometry(previous => previous.scale === scale && previous.height === height
        ? previous : { scale, height });
    };
    measure();
    const observer = new window.ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(document);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={viewportRef} style={{ width: '100%' }}>
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          body:has(#ead-certificate-preview-modal) { margin: 0 !important; overflow: visible !important; }
          body:has(#ead-certificate-preview-modal) > :not(#ead-certificate-preview-modal) { display: none !important; }
          #ead-certificate-preview-modal, #ead-certificate-preview-modal > div {
            position: static !important; width: auto !important; height: auto !important;
            overflow: visible !important; padding: 0 !important; background: white !important;
            backdrop-filter: none !important;
          }
          #ead-certificate-preview-modal > div > div { max-width: none !important; margin: 0 !important; }
          [data-ead-certificate-preview-actions] { display: none !important; }
          [data-ead-certificate-preview-frame] { width: 297mm !important; height: auto !important; }
          [data-ead-certificate-preview-document] { position: static !important; transform: none !important; }
          [data-ead-certificate-preview-document] [data-certificate-pdf-page] {
            margin: 0 !important; break-inside: avoid !important; break-after: page !important;
          }
          [data-ead-certificate-preview-document] [data-certificate-pdf-page]:last-child { break-after: auto !important; }
        }
      `}</style>
      <div data-ead-certificate-preview-frame style={{
        position: 'relative', margin: '0 auto', width: A4_LANDSCAPE_WIDTH * geometry.scale,
        height: geometry.height * geometry.scale,
      }}>
        <div ref={documentRef} data-ead-certificate-preview-document style={{
          position: 'absolute', left: 0, top: 0, width: '297mm',
          transform: `scale(${geometry.scale})`, transformOrigin: 'top left',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default EadCertificateScaledPreview;

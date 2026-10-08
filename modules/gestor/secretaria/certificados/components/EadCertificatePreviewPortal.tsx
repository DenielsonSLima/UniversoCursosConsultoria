import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface EadCertificatePreviewPortalProps {
  children: React.ReactNode;
  onClose: () => void;
}

const EadCertificatePreviewPortal: React.FC<EadCertificatePreviewPortalProps> = ({
  children,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';

    const focusableElements = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ) || [])].filter((element) => !element.hasAttribute('aria-hidden'));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements();
      if (!elements.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      const closeButton = dialogRef.current?.querySelector<HTMLElement>(
        '[aria-label="Fechar prévia do certificado"]',
      );
      (closeButton || focusableElements()[0] || dialogRef.current)?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const content = (
    <div
      ref={dialogRef}
      id="ead-certificate-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Certificado EAD"
      tabIndex={-1}
      className="fixed inset-0 z-[2147483000] h-[100dvh] w-screen outline-none"
    >
      {children}
    </div>
  );

  // Animated course panels create containing blocks for fixed descendants.
  // Only the EAD viewer moves to the viewport; the certificate stays intact.
  return typeof document === 'undefined' ? content : createPortal(content, document.body);
};

export default EadCertificatePreviewPortal;

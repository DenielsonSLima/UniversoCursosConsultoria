import { useEffect, type RefObject } from 'react';

const useBanesePaymentOverlay = (
  pageRef: RefObject<HTMLElement | null>,
  onBack: () => void,
) => {
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previouslyFocusedElement = document.activeElement;
    const applicationRoot = document.getElementById('root');
    const previousRootAriaHidden = applicationRoot?.getAttribute('aria-hidden');
    const rootWasInert = applicationRoot?.hasAttribute('inert') ?? false;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    applicationRoot?.setAttribute('aria-hidden', 'true');
    applicationRoot?.setAttribute('inert', '');
    pageRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      if (previousRootAriaHidden === null || previousRootAriaHidden === undefined) {
        applicationRoot?.removeAttribute('aria-hidden');
      } else {
        applicationRoot?.setAttribute('aria-hidden', previousRootAriaHidden);
      }
      if (!rootWasInert) applicationRoot?.removeAttribute('inert');
      if (previouslyFocusedElement instanceof HTMLElement && previouslyFocusedElement.isConnected) {
        previouslyFocusedElement.focus();
      }
    };
  }, [onBack, pageRef]);
};

export default useBanesePaymentOverlay;

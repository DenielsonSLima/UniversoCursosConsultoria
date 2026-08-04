import { type RefObject, useLayoutEffect } from 'react';

const FULLSCREEN_ATTRIBUTE = 'data-aluno-fullscreen';

/**
 * Mantém o documento preso ao viewport nas telas nativas de acesso.
 * A rolagem continua disponível apenas nos contêineres internos que a
 * declaram explicitamente (formulário baixo/teclado e histórico do chat).
 */
export const useAlunoFullscreenViewport = () => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute(FULLSCREEN_ATTRIBUTE, 'true');

    const viewport = window.visualViewport;
    let largestViewportHeight = viewport?.height || window.innerHeight;

    const syncViewport = () => {
      const viewportHeight = viewport?.height || window.innerHeight;
      largestViewportHeight = Math.max(largestViewportHeight, viewportHeight);
      root.style.setProperty('--aluno-visual-viewport-height', `${Math.round(viewportHeight)}px`);
      root.toggleAttribute('data-aluno-keyboard', largestViewportHeight - viewportHeight > 120);
    };

    const resetViewportBaseline = () => {
      largestViewportHeight = viewport?.height || window.innerHeight;
      syncViewport();
    };

    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', resetViewportBaseline);

    return () => {
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', resetViewportBaseline);
      root.style.removeProperty('--aluno-visual-viewport-height');
      root.removeAttribute('data-aluno-keyboard');
      root.removeAttribute(FULLSCREEN_ATTRIBUTE);
    };
  }, []);
};

/**
 * Evita criar um UIScrollView web rolável quando a tela já cabe inteira.
 * O atributo muda automaticamente com conteúdo, rotação e teclado.
 */
export const useAlunoContainedScroll = <T extends HTMLElement>(
  scrollRef: RefObject<T | null>,
) => {
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return undefined;

    let frame = 0;
    const syncScrollability = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const canScroll = scroller.scrollHeight - scroller.clientHeight > 2;
        scroller.setAttribute('data-can-scroll', canScroll ? 'true' : 'false');
        if (!canScroll && scroller.scrollTop !== 0) scroller.scrollTop = 0;
      });
    };

    const observer = new globalThis.ResizeObserver(syncScrollability);
    observer.observe(scroller);
    const content = scroller.firstElementChild;
    if (content instanceof HTMLElement) observer.observe(content);

    syncScrollability();
    window.visualViewport?.addEventListener('resize', syncScrollability);
    window.addEventListener('orientationchange', syncScrollability);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', syncScrollability);
      window.removeEventListener('orientationchange', syncScrollability);
      scroller.removeAttribute('data-can-scroll');
    };
  }, [scrollRef]);
};

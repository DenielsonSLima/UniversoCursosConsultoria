export interface PendingBoletoTab {
  cancel: () => void;
  result: Promise<void>;
}

// Open synchronously in the click handler so Safari does not block an awaited popup.
export function openEadBoletoTab(load: (signal: AbortSignal) => Promise<Blob>): PendingBoletoTab {
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error('Permita abrir uma nova aba neste site para visualizar o boleto.');
  tab.opener = null;
  tab.document.title = 'Abrindo boleto';
  tab.document.body.textContent = 'Carregando boleto com acesso autenticado…';
  const controller = new AbortController();
  let pending = true;
  const result = (async () => {
    try {
      const pdf = await load(controller.signal);
      if (controller.signal.aborted || tab.closed) return;
      const url = URL.createObjectURL(pdf);
      try {
        tab.location.replace(`${url}#toolbar=1&navpanes=0&view=FitH`);
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    } catch (error) {
      if (!controller.signal.aborted && !tab.closed) tab.close();
      if (!controller.signal.aborted) throw error;
    } finally {
      pending = false;
    }
  })();
  return { result, cancel: () => {
    if (!pending) return;
    controller.abort();
    if (!tab.closed) tab.close();
  } };
}

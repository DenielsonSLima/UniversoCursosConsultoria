export const preparePaymentWindow = () => {
  const paymentWindow = window.open('', '_blank');
  if (!paymentWindow) return null;

  paymentWindow.document.title = 'Preparando pagamento';
  paymentWindow.document.body.replaceChildren();

  const message = paymentWindow.document.createElement('p');
  message.textContent = 'Preparando pagamento...';
  message.style.cssText = [
    'font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    'padding: 24px',
    'color: #0f172a',
  ].join(';');
  paymentWindow.document.body.append(message);

  return paymentWindow;
};

export const navigatePaymentWindow = (
  paymentWindow: Window | null,
  url: string,
) => {
  if (!paymentWindow || paymentWindow.closed) return false;

  try {
    paymentWindow.opener = null;
    paymentWindow.location.replace(url);
    paymentWindow.focus();
    return true;
  } catch {
    try {
      paymentWindow.close();
    } catch {
      // A página principal exibirá o fallback autenticado.
    }
    return false;
  }
};

export const renderPdfInPaymentWindow = (
  paymentWindow: Window | null,
  pdf: Blob,
) => {
  if (!paymentWindow || paymentWindow.closed) return false;

  const documentUrl = URL.createObjectURL(pdf);
  try {
    paymentWindow.opener = null;
    paymentWindow.location.replace(documentUrl);
    paymentWindow.focus();
    // Mantém o documento disponível para impressão/download e libera a URL
    // depois de uma janela confortável de uso.
    window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60 * 60_000);
    return true;
  } catch {
    URL.revokeObjectURL(documentUrl);
    try {
      paymentWindow.close();
    } catch {
      // A página principal exibirá o fallback autenticado.
    }
    return false;
  }
};

export const renderPaymentWindowError = (
  paymentWindow: Window | null,
  message: string,
) => {
  if (!paymentWindow || paymentWindow.closed) return false;

  try {
    paymentWindow.document.title = 'Pagamento não iniciado';
    paymentWindow.document.body.replaceChildren();

    const main = paymentWindow.document.createElement('main');
    main.style.cssText = [
      'font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'max-width: 560px',
      'margin: 0 auto',
      'padding: 48px 24px',
      'color: #0f172a',
    ].join(';');

    const eyebrow = paymentWindow.document.createElement('p');
    eyebrow.textContent = 'Pagamento não iniciado';
    eyebrow.style.cssText = [
      'margin: 0 0 12px',
      'color: #dc2626',
      'font-size: 12px',
      'font-weight: 800',
      'letter-spacing: .08em',
      'text-transform: uppercase',
    ].join(';');

    const heading = paymentWindow.document.createElement('h1');
    heading.textContent = 'Não foi possível preparar a cobrança.';
    heading.style.cssText = 'margin: 0 0 12px; font-size: 28px; line-height: 1.15';

    const detail = paymentWindow.document.createElement('p');
    detail.textContent = message;
    detail.style.cssText = 'margin: 0 0 24px; color: #475569; font-size: 15px; line-height: 1.6';

    const closeButton = paymentWindow.document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = 'Fechar';
    closeButton.style.cssText = [
      'border: 0',
      'border-radius: 12px',
      'background: #2563eb',
      'color: white',
      'padding: 12px 18px',
      'font-size: 12px',
      'font-weight: 800',
      'letter-spacing: .08em',
      'text-transform: uppercase',
      'cursor: pointer',
    ].join(';');
    closeButton.addEventListener('click', () => paymentWindow.close());

    main.append(eyebrow, heading, detail, closeButton);
    paymentWindow.document.body.append(main);
    paymentWindow.focus();
    return true;
  } catch {
    return false;
  }
};

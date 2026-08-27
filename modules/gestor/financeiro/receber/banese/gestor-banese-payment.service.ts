import { supabase } from '../../../../../lib/supabase';

const readFunctionError = async (error: unknown) => {
  const context = (error as {
    context?: { json?: () => Promise<{ error?: string }> };
  })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return body?.error
    || (error instanceof Error ? error.message : 'Não foi possível gerar o boleto Banese.');
};

export const gestorBanesePaymentService = {
  async openBoletoPdfInNewTab(receivableId: string, preparedTab?: Window | null): Promise<void> {
    const printTab = preparedTab || window.open('about:blank', '_blank');
    if (!printTab) {
      throw new Error('O navegador bloqueou a nova aba. Permita pop-ups para abrir o boleto.');
    }

    printTab.opener = null;
    printTab.document.title = 'Montando boleto Banese';
    printTab.document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;background:#eef2f6;color:#001a33;font-family:Arial,sans-serif">
        <div style="text-align:center">
          <strong style="display:block;font-size:16px">Montando boleto Banese...</strong>
          <span style="display:block;margin-top:8px;font-size:12px;color:#64748b">Validando os dados bancários para impressão.</span>
        </div>
      </main>
    `;

    try {
      const { data, error } = await supabase.functions.invoke<Blob>(
        'banese-boleto-document',
        { body: { receivableId } },
      );
      if (error) throw new Error(await readFunctionError(error));
      if (!(data instanceof Blob) || !data.type.toLowerCase().includes('application/pdf')) {
        throw new Error('O servidor não retornou um PDF Banese válido.');
      }

      const documentUrl = URL.createObjectURL(data);
      printTab.location.replace(`${documentUrl}#toolbar=1&navpanes=0&view=FitH`);
      window.setTimeout(() => URL.revokeObjectURL(documentUrl), 5 * 60_000);
    } catch (error) {
      printTab.document.title = 'Boleto Banese indisponível';
      printTab.document.body.textContent = '';
      const message = printTab.document.createElement('main');
      message.style.cssText = 'min-height:100vh;display:grid;place-items:center;padding:32px;background:#eef2f6;color:#001a33;font-family:Arial,sans-serif;text-align:center';
      message.textContent = 'Não foi possível montar este boleto com segurança. Volte ao Portal de Gestão e confira a mensagem apresentada.';
      printTab.document.body.appendChild(message);
      throw error;
    }
  },
};

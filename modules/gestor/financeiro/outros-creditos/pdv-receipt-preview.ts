import type { PdvReceipt, PdvReceiptTemplate } from './pdv-receipt.types';

/** Dados explicitamente fictícios, somente para a prévia do modelo da impressora. */
export function createPdvReceiptPreview(template: PdvReceiptTemplate): PdvReceipt {
  return {
    version: 1, id: 'MODELO-SEM-VALIDADE', number: 'PRÉVIA',
    receivableId: '', poloId: '', issuedAt: '', totalCents: 12345,
    totalDisplay: 'R$ 123,45', paidAt: '2026-01-01', paidAtDisplay: '01/01/2026',
    paymentMethod: 'Pix', payer: { name: 'PAGADOR DE EXEMPLO', documentMasked: '12*.***.**9-01',
      documentLabel: 'CPF', enrollmentNumber: 'UNIV-A-00000001' },
    description: 'Serviço de exemplo — modelo sem validade financeira',
    issuer: { id: '', name: 'UNIVERSO CURSOS E CONSULTORIA', cnpj: '', address: '', number: '',
      complement: '', neighborhood: '', city: 'Japoatã', state: 'SE', postalCode: '', phone: '',
      email: 'universo.cursoseconsultoria@gmail.com', isHeadquarters: true, logoUrl: '/LogoUniverso.png',
      watermarkUrl: null, watermarkOpacity: null, watermarkScale: null, watermarkRotate: null },
    template, printerId: null, behavior: 'PERGUNTAR', transport: 'BROWSER', transportReady: true, automaticReady: false,
  };
}

export async function previewPdvReceiptTemplate(template: Omit<PdvReceiptTemplate, 'version' | 'source'>) {
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('Permita abrir a prévia do recibo neste navegador.');
  preview.opener = null;
  preview.document.title = 'Prévia do recibo — sem validade';
  preview.document.body.textContent = 'Preparando prévia do modelo...';
  try {
    const { createPdvReceiptPdf } = await import('./pdv-receipt.pdf');
    const { blob } = await createPdvReceiptPdf(createPdvReceiptPreview({ ...template, version: 1, source: 'PRINTER' }));
    const url = URL.createObjectURL(blob);
    preview.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
  } catch (error) {
    preview.close();
    throw error;
  }
}

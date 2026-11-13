export type ServiceInvoiceDetails = { number: string; description: string };

/** Fiscal metadata is descriptive. It never replaces any bank identifier. */
export function validateServiceInvoiceDetails(
  value: unknown,
): ServiceInvoiceDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "Dados da NFS-e do serviço são inválidos no documento Banese.",
    );
  }
  const invoice = value as Record<string, unknown>;
  if (
    typeof invoice.number !== "string" || !/^\d{1,30}$/.test(invoice.number)
  ) {
    throw new Error(
      "Número da NFS-e do serviço deve conter de 1 a 30 dígitos.",
    );
  }
  if (
    typeof invoice.description !== "string" || !invoice.description.trim() ||
    [...invoice.description].length > 2_000 ||
    [...invoice.description].some((character) => {
      const code = character.codePointAt(0)!;
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  ) {
    throw new Error(
      "Descrição integral da NFS-e do serviço deve conter até 2.000 caracteres válidos.",
    );
  }
  return { number: invoice.number, description: invoice.description.trim() };
}

export const onlyDigits = (value?: string | null) => String(value || "").replace(/\D/g, "");

export const isValidCpf = (value: string) => {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (slice: string, factor: number) => {
    const sum = slice.split("").reduce((total, digit) => total + Number(digit) * factor--, 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calcDigit(cpf.slice(0, 9), 10) === Number(cpf[9])
    && calcDigit(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

export const isValidEmail = (value?: string | null) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());

export const hasValidPhone = (value?: string | null) => {
  const digits = onlyDigits(value);
  return digits.length >= 10 && digits.length <= 11;
};

export const resolveBillingContacts = (partner: any) => ({
  cpfCnpj: onlyDigits(
    partner?.responsavel_financeiro && partner?.responsavel_cpf
      ? partner.responsavel_cpf
      : partner?.cpf_cnpj,
  ),
  email: partner?.responsavel_financeiro
    ? partner?.responsavel_email || partner?.email
    : partner?.email,
  phone: partner?.responsavel_financeiro
    ? partner?.responsavel_telefone || partner?.telefone
    : partner?.telefone,
});

export const missingCustomerBillingFields = (
  partner: any,
  cpfCnpj = onlyDigits(partner?.cpf_cnpj),
  email = partner?.email,
  phone = partner?.telefone,
) => {
  const missing: string[] = [];
  if (!String(partner?.nome || "").trim()) missing.push("nome");
  if (!cpfCnpj) missing.push("CPF");
  if (!isValidEmail(email)) missing.push("email");
  if (!hasValidPhone(phone)) missing.push("telefone");
  return missing;
};

export const assertRequiredCustomerBillingData = (
  partner: any,
  cpfCnpj: string,
  email?: string | null,
  phone?: string | null,
) => {
  const missing = missingCustomerBillingFields(partner, cpfCnpj, email, phone);
  if (missing.length > 0) {
    throw new Error(`Atualize o cadastro do aluno/parceiro antes de enviar ao Asaas. Campos obrigatorios: ${missing.join(", ")}.`);
  }
};

export const missingStudentBillingFields = (student: any) =>
  missingCustomerBillingFields(student, onlyDigits(student?.cpf_cnpj), student?.email, student?.telefone);

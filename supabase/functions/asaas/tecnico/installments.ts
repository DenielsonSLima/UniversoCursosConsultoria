import { onlyDigits, assertRequiredCustomerBillingData, isValidCpf, resolveBillingContacts } from "../core/customer.ts";
import { formatCurrency, formatDate, roundMoney, toNumber } from "../core/money.ts";
import { isTecnicoCycleLaunch } from "./cycle.ts";

type CallAsaas = (path: string, init?: RequestInit) => Promise<any>;

interface TecnicoInstallmentOptions {
  notificationDisabled?: boolean;
}

const one = (value: any) => Array.isArray(value) ? value[0] : value;
const normalize = (value: unknown) => String(value || "").toUpperCase();

const RECEIVABLE_SELECT = `
  *,
  parceiros(*),
  turmas(
    id,
    nome,
    desconto_pontualidade,
    juros_atraso,
    multa_atraso,
    aplicar_desconto_mensalidade,
    aplicar_multa_juros_mensalidade,
    cursos(id, nome, modalidade)
  )
`;

export const createTecnicoInstallmentService = (
  admin: any,
  callAsaas: CallAsaas,
  options: TecnicoInstallmentOptions = {},
) => {
  const ensureCustomer = async (partner: any) => {
    const { cpfCnpj, email, phone } = resolveBillingContacts(partner);
    assertRequiredCustomerBillingData(partner, cpfCnpj, email, phone);
    if (!isValidCpf(cpfCnpj)) {
      throw new Error("CPF inválido para cobrança. Atualize o cadastro do aluno antes de enviar ao Asaas.");
    }

    if (partner.asaas_customer_id) {
      await callAsaas(`/customers/${partner.asaas_customer_id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: partner.nome,
          cpfCnpj,
          email,
          mobilePhone: phone,
          externalReference: partner.id,
          notificationDisabled: options.notificationDisabled !== false,
        }),
      }).catch((error) => {
        console.warn("Não foi possível atualizar cliente técnico no Asaas:", error);
      });
      return partner.asaas_customer_id as string;
    }

    const found = await callAsaas(`/customers?cpfCnpj=${cpfCnpj}&limit=1`);
    let customer = found?.data?.[0];
    if (!customer) {
      customer = await callAsaas("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: partner.nome,
          cpfCnpj,
          email,
          mobilePhone: phone,
          postalCode: onlyDigits(partner.cep) || undefined,
          address: partner.endereco || undefined,
          addressNumber: partner.numero || undefined,
          complement: partner.complemento || undefined,
          province: partner.bairro || undefined,
          externalReference: partner.id,
          notificationDisabled: options.notificationDisabled !== false,
        }),
      });
    }

    await admin.from("parceiros")
      .update({ asaas_customer_id: customer.id, updated_at: new Date().toISOString() })
      .eq("id", partner.id);
    return customer.id as string;
  };

  const loadCycleReceivables = async (matriculaId: string) => {
    const { data, error } = await admin
      .from("contas_receber")
      .select(RECEIVABLE_SELECT)
      .eq("matricula_id", matriculaId)
      .in("status", ["PENDENTE", "VENCIDO"])
      .neq("tipo_lancamento", "MATRICULA")
      .order("data_vencimento", { ascending: true });
    if (error) throw error;
    return data || [];
  };

  const isTecnicoReceivable = (receivable: any) => {
    const turma = one(receivable?.turmas);
    const course = one(turma?.cursos);
    return normalize(course?.modalidade) === "TECNICO" && isTecnicoCycleLaunch(receivable);
  };

  const canCreateSingleAsaasInstallment = (receivables: any[]) => {
    if (!receivables.length) return false;
    const firstValue = roundMoney(toNumber(receivables[0]?.valor));
    const firstDay = String(receivables[0]?.data_vencimento || "").slice(8, 10);
    return receivables.every((item) =>
      roundMoney(toNumber(item?.valor)) === firstValue
      && String(item?.data_vencimento || "").slice(8, 10) === firstDay
    );
  };

  const buildInstallmentPayload = (customerId: string, receivables: any[]) => {
    const first = receivables[0];
    const turma = one(first?.turmas);
    const value = roundMoney(toNumber(first?.valor));
    const discountValue = roundMoney(toNumber(turma?.desconto_pontualidade));
    const interestPercent = toNumber(turma?.juros_atraso);
    const fineValue = roundMoney(toNumber(turma?.multa_atraso));
    const discountEnabled = turma?.aplicar_desconto_mensalidade !== false;
    const penaltyEnabled = turma?.aplicar_multa_juros_mensalidade !== false;
    const discountApplies = discountEnabled && discountValue > 0 && discountValue < value;
    const fineApplies = penaltyEnabled && fineValue > 0;
    const interestApplies = penaltyEnabled && interestPercent > 0;
    const descriptionLines = [
      `Mensalidades - ${turma?.nome || "Curso Técnico"} - Universo Cursos e Consultoria`,
      discountApplies
        ? `Desconto de pontualidade de ${formatCurrency(discountValue)} para pagamento até ${formatDate(first.data_vencimento)}.`
        : null,
      fineApplies || interestApplies
        ? `Após o vencimento: ${fineApplies ? `multa de ${formatCurrency(fineValue)}` : ""}${fineApplies && interestApplies ? " e " : ""}${interestApplies ? `juros de ${interestPercent}% ao mês` : ""}.`
        : null,
    ].filter(Boolean);

    const payload: Record<string, unknown> = {
      customer: customerId,
      billingType: "BOLETO",
      installmentCount: receivables.length,
      value,
      dueDate: first.data_vencimento,
      description: descriptionLines.join("\n").slice(0, 500),
      postalService: false,
    };

    if (discountApplies) payload.discount = { value: discountValue, dueDateLimitDays: 0, type: "FIXED" };
    if (interestApplies) payload.interest = { value: interestPercent };
    if (fineApplies) payload.fine = { value: fineValue, type: "FIXED" };
    if (fineApplies || interestApplies) payload.daysAfterDueDateToRegistrationCancellation = 30;
    return payload;
  };

  const listPaymentsByInstallment = async (installmentId: string) => {
    const response = await callAsaas(`/payments?installment=${encodeURIComponent(installmentId)}&limit=100`);
    return (response?.data || []).sort((a: any, b: any) => {
      const installmentNumberDiff = Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0);
      if (installmentNumberDiff) return installmentNumberDiff;
      return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
    });
  };

  const markCycleError = async (receivables: any[], message: string) => {
    const ids = receivables.map((item) => item.id).filter(Boolean);
    if (!ids.length) return;
    await admin.from("contas_receber").update({
      asaas_status: null,
      asaas_last_error: message,
      updated_at: new Date().toISOString(),
    }).in("id", ids);
  };

  const syncFutureInstallments = async (matriculaId: string) => {
    const receivables = await loadCycleReceivables(matriculaId);
    if (!receivables.length) return { success: true, skipped: true, reason: "Sem parcelas futuras pendentes." };
    if (!receivables.every(isTecnicoReceivable)) {
      return { success: true, skipped: true, reason: "Matrícula não pertence ao fluxo técnico Asaas." };
    }

    const installmentIds = Array.from(new Set(
      receivables.map((item: any) => String(item.asaas_installment_id || "").trim()).filter(Boolean),
    ));
    if (installmentIds.length === 1 && receivables.every((item: any) => String(item.asaas_installment_id || "").trim() === installmentIds[0])) {
      return { success: true, skipped: true, installmentId: installmentIds[0], reason: "Parcelamento técnico já sincronizado." };
    }
    if (installmentIds.length > 0) {
      await markCycleError(receivables, "Parcelamento técnico parcial/inconsistente. Refaça a sincronização antes de gerar carnê.");
      throw new Error("Parcelamento técnico parcial/inconsistente. Refaça a sincronização antes de gerar carnê.");
    }

    const individuallySynced = receivables.filter((item: any) => item.asaas_payment_id && !item.asaas_installment_id);
    if (individuallySynced.length) {
      return {
        success: true,
        skipped: true,
        reason: "Parcelas técnicas já sincronizadas como cobranças individuais; mantendo compatibilidade sem duplicar no Asaas.",
      };
    }

    if (!canCreateSingleAsaasInstallment(receivables)) {
      return {
        success: true,
        skipped: true,
        reason: "Cronograma técnico possui valores ou dias de vencimento diferentes; use sincronização individual.",
      };
    }

    await admin.from("contas_receber").update({
      asaas_status: "CREATING",
      asaas_last_error: null,
      updated_at: new Date().toISOString(),
    }).in("id", receivables.map((item: any) => item.id));

    try {
      const customerId = await ensureCustomer(receivables[0].parceiros);
      const installment = await callAsaas("/installments", {
        method: "POST",
        body: JSON.stringify(buildInstallmentPayload(customerId, receivables)),
      });
      const installmentId = installment?.id;
      if (!installmentId) throw new Error("O Asaas não retornou o ID do parcelamento técnico.");

      const payments = await listPaymentsByInstallment(installmentId);
      for (let index = 0; index < receivables.length; index += 1) {
        const receivable = receivables[index];
        const payment = payments[index];
        await admin.from("contas_receber").update({
          asaas_payment_id: payment?.id || receivable.asaas_payment_id || null,
          nosso_numero_asaas: payment?.id || receivable.nosso_numero_asaas || null,
          asaas_invoice_url: payment?.invoiceUrl || null,
          asaas_bank_slip_url: payment?.bankSlipUrl || null,
          asaas_installment_id: installmentId,
          asaas_transaction_receipt_url: payment?.transactionReceiptUrl || null,
          asaas_status: payment?.status || installment?.status || "PENDING",
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", receivable.id);
      }

      return { success: true, installmentId, count: receivables.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markCycleError(receivables, message);
      throw error;
    }
  };

  return {
    isTecnicoReceivable,
    syncFutureInstallments,
  };
};

import { mapBillingType } from "./checkout-rules.ts";
import type { CheckoutContext } from "./checkout-context.ts";
import {
  isPaidPayment,
  normalizeGatewayPaymentMethod,
} from "./checkout-utils.ts";
import { onlyDigits } from "../../asaas/core/customer.ts";
import { paymentDate } from "../../asaas/core/status.ts";
import { persistAsaasGatewayTransaction } from "./asaas-transaction-service.ts";

export const createAsaasCheckoutServices = (
  context: CheckoutContext,
  apiKey: string,
  baseUrl: string,
) => {
  const {
    admin,
    environment,
    aluno,
    cpfCnpj,
    notificationsEnabled,
    isEadCheckout,
    receivableFeeFields,
    keepTechnicalDocumentationPending,
    matricula,
  } = context;

  const callAsaas = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Universo-Cursos-Aluno",
        access_token: apiKey,
        ...(init.headers || {}),
      },
    });
    const payload = response.status === 204
      ? null
      : await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.errors?.map((item: any) =>
        item.description
      ).join(" ") ||
        payload?.message ||
        `Erro ${response.status} na API do Asaas.`;
      const error = new Error(message) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  const recoverPaymentByReceivableId = async (receivableId: string) => {
    const response = await callAsaas(
      `/payments?externalReference=${
        encodeURIComponent(receivableId)
      }&limit=10`,
    ).catch(() => null);
    const recoveredPayment = (response?.data || []).find((item: any) =>
      String(item.externalReference || "") === receivableId &&
      !["DELETED", "REFUNDED"].includes(String(item.status || "").toUpperCase())
    );
    if (!recoveredPayment?.id) return null;

    const { data: recoveredReceivable, error: recoveredError } = await admin
      .from("contas_receber")
      .update({
        asaas_payment_id: recoveredPayment.id,
        asaas_payment_link_id: null,
        nosso_numero_asaas: recoveredPayment.id,
        asaas_invoice_url: recoveredPayment.invoiceUrl || null,
        asaas_bank_slip_url: recoveredPayment.bankSlipUrl || null,
        asaas_installment_id: recoveredPayment.installment ||
          recoveredPayment.installmentId || null,
        asaas_transaction_receipt_url: recoveredPayment.transactionReceiptUrl ||
          null,
        asaas_status: recoveredPayment.status || null,
        gateway_provider: "asaas",
        gateway_environment: environment,
        gateway_payment_method: normalizeGatewayPaymentMethod(
          recoveredPayment.billingType,
        ),
        gateway_payment_id: recoveredPayment.id,
        gateway_customer_id: recoveredPayment.customer || null,
        gateway_payment_link_id: null,
        gateway_installment_id: recoveredPayment.installment ||
          recoveredPayment.installmentId || null,
        gateway_invoice_url: recoveredPayment.invoiceUrl || null,
        gateway_bank_slip_url: recoveredPayment.bankSlipUrl || null,
        gateway_transaction_receipt_url:
          recoveredPayment.transactionReceiptUrl || null,
        gateway_status: recoveredPayment.status || null,
        gateway_synced_at: new Date().toISOString(),
        gateway_last_error: null,
        asaas_synced_at: new Date().toISOString(),
        asaas_last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivableId)
      .select()
      .single();
    if (recoveredError) throw recoveredError;
    return {
      receivable: recoveredReceivable,
      payment: recoveredPayment,
    };
  };

  const persistCustomerId = async (customerId: string) => {
    await admin.from("parceiros")
      .update({
        asaas_customer_id: customerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", aluno.id);
    await admin.from("payment_gateway_customers").upsert({
      parceiro_id: aluno.id,
      provider_code: "asaas",
      environment,
      remote_customer_id: customerId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "parceiro_id,provider_code,environment",
    }).then(({ error }: any) => {
      if (error) {
        console.warn(
          "Nao foi possivel espelhar cliente Asaas no gateway bancario:",
          error,
        );
      }
    });
    aluno.asaas_customer_id = customerId;
    return customerId;
  };

  const findOrCreateCustomerByCpf = async () => {
    const found = await callAsaas(
      `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}&limit=1`,
    );
    let customer = found?.data?.[0];
    if (!customer) {
      customer = await callAsaas("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: aluno.nome,
          cpfCnpj,
          email: aluno.email || undefined,
          mobilePhone: aluno.telefone || undefined,
          postalCode: onlyDigits(aluno.cep) || undefined,
          address: aluno.endereco || undefined,
          addressNumber: aluno.numero || undefined,
          complement: aluno.complemento || undefined,
          province: aluno.bairro || undefined,
          externalReference: aluno.id,
          notificationDisabled: !notificationsEnabled,
          groupName: "Alunos Universo",
        }),
      });
    }

    await callAsaas(`/customers/${customer.id}`, {
      method: "PUT",
      body: JSON.stringify({
        notificationDisabled: !notificationsEnabled,
        externalReference: aluno.id,
      }),
    }).catch((updateError) => {
      console.warn(
        "Não foi possível atualizar preferência de notificações do cliente no Asaas:",
        updateError,
      );
    });

    return persistCustomerId(customer.id);
  };

  const ensureCustomer = async () => {
    if (aluno.asaas_customer_id) {
      try {
        const updatedCustomer = await callAsaas(
          `/customers/${aluno.asaas_customer_id}`,
          {
            method: "PUT",
            body: JSON.stringify({
              name: aluno.nome,
              cpfCnpj,
              email: aluno.email || undefined,
              mobilePhone: aluno.telefone || undefined,
              postalCode: onlyDigits(aluno.cep) || undefined,
              address: aluno.endereco || undefined,
              addressNumber: aluno.numero || undefined,
              complement: aluno.complemento || undefined,
              province: aluno.bairro || undefined,
              externalReference: aluno.id,
              notificationDisabled: !notificationsEnabled,
            }),
          },
        );
        if (
          updatedCustomer?.cpfCnpj &&
          onlyDigits(updatedCustomer.cpfCnpj) !== cpfCnpj
        ) {
          console.warn(
            "Cliente Asaas vinculado possui CPF/CNPJ diferente; será feita busca pelo CPF do aluno.",
          );
          return findOrCreateCustomerByCpf();
        }
        return aluno.asaas_customer_id as string;
      } catch (updateError) {
        console.warn(
          "Não foi possível atualizar cliente Asaas já vinculado; será feita busca por CPF.",
          updateError,
        );
        return findOrCreateCustomerByCpf();
      }
    }

    return findOrCreateCustomerByCpf();
  };

  const persistGatewayTransaction = (payment: any, currentReceivable: any) =>
    persistAsaasGatewayTransaction(context, payment, currentReceivable);
  let existingReceivable: any = null;

  const clearLocalAsaasPayment = async (
    receivableId: string,
    reason: string,
  ) => {
    const { data, error } = await admin
      .from("contas_receber")
      .update({
        asaas_payment_id: null,
        asaas_payment_link_id: null,
        nosso_numero_asaas: null,
        asaas_invoice_url: null,
        asaas_bank_slip_url: null,
        asaas_installment_id: null,
        asaas_transaction_receipt_url: null,
        asaas_status: null,
        asaas_synced_at: null,
        asaas_last_error: reason,
        gateway_payment_id: null,
        gateway_payment_link_id: null,
        gateway_installment_id: null,
        gateway_invoice_url: null,
        gateway_bank_slip_url: null,
        gateway_transaction_receipt_url: null,
        gateway_status: null,
        gateway_synced_at: null,
        gateway_last_error: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receivableId)
      .neq("status", "PAGO")
      .select()
      .single();
    if (error) throw error;
    return data;
  };

  const moneyValue = (value: unknown) =>
    Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

  const remotePaymentMatchesCharge = (payment: any, expectedCharge: any) => {
    if (!expectedCharge) return true;
    const expectedBillingType = String(expectedCharge.billingType || "")
      .toUpperCase();
    const remoteBillingType = String(payment?.billingType || "").toUpperCase();
    if (!expectedBillingType || remoteBillingType !== expectedBillingType) {
      return false;
    }

    const expectedInstallments = Number(expectedCharge.installmentCount || 1);
    const expectedHasInstallments = expectedBillingType === "CREDIT_CARD" &&
      expectedInstallments > 1;
    const remoteHasInstallments = Boolean(
      payment?.installment || payment?.installmentId,
    );
    if (expectedHasInstallments !== remoteHasInstallments) return false;

    const expectedPaymentValue = expectedHasInstallments
      ? moneyValue(Number(expectedCharge.value || 0) / expectedInstallments)
      : moneyValue(expectedCharge.value);
    return Math.abs(moneyValue(payment?.value) - expectedPaymentValue) <= 0.01;
  };

  const cancelRemoteAndClearLocalPayment = async (
    currentReceivable: any,
    reason: string,
  ) => {
    if (currentReceivable?.asaas_payment_id) {
      const response = await fetch(
        `${baseUrl}/payments/${currentReceivable.asaas_payment_id}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "Universo-Cursos-Aluno",
            access_token: apiKey,
          },
        },
      );
      const payload = response.status === 204
        ? null
        : await response.json().catch(() => null);
      if (!response.ok && response.status !== 404) {
        const message = payload?.errors?.map((item: any) =>
          item.description
        ).join(" ") ||
          payload?.message ||
          `Erro ${response.status} ao cancelar cobrança anterior no Asaas.`;
        throw new Error(message);
      }
    }

    return clearLocalAsaasPayment(currentReceivable.id, reason);
  };

  const getReusableExistingPaymentUrl = async (
    currentReceivable: any,
    expectedCharge?: any,
  ) => {
    if (!currentReceivable?.asaas_payment_id) return null;
    const localAsaasStatus = String(currentReceivable.asaas_status || "")
      .toUpperCase();
    if (
      ["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(
        localAsaasStatus,
      )
    ) {
      existingReceivable = await clearLocalAsaasPayment(
        currentReceivable.id,
        "Cobrança Asaas local estava cancelada/deletada; será gerado novo checkout.",
      );
      return null;
    }

    try {
      const remotePayment = await callAsaas(
        `/payments/${currentReceivable.asaas_payment_id}`,
      );
      const remoteStatus = String(remotePayment?.status || "").toUpperCase();
      if (
        ["DELETED", "REFUNDED", "CANCELLED", "CANCELED"].includes(remoteStatus)
      ) {
        existingReceivable = await clearLocalAsaasPayment(
          currentReceivable.id,
          "Cobrança Asaas remota estava cancelada/deletada; será gerado novo checkout.",
        );
        return null;
      }

      const paid = isPaidPayment(remotePayment);
      if (
        !paid && expectedCharge &&
        !remotePaymentMatchesCharge(remotePayment, expectedCharge)
      ) {
        existingReceivable = await cancelRemoteAndClearLocalPayment(
          currentReceivable,
          "Cobrança Asaas anterior não corresponde à opção de pagamento EAD escolhida; será gerado novo checkout.",
        );
        return null;
      }
      const { data: refreshedReceivable, error: refreshError } = await admin
        .from("contas_receber")
        .update({
          asaas_payment_id: remotePayment.id ||
            currentReceivable.asaas_payment_id,
          nosso_numero_asaas: remotePayment.id ||
            currentReceivable.nosso_numero_asaas,
          asaas_invoice_url: remotePayment.invoiceUrl ||
            currentReceivable.asaas_invoice_url || null,
          asaas_bank_slip_url: remotePayment.bankSlipUrl ||
            currentReceivable.asaas_bank_slip_url || null,
          asaas_installment_id: remotePayment.installment ||
            remotePayment.installmentId ||
            currentReceivable.asaas_installment_id || null,
          asaas_transaction_receipt_url: remotePayment.transactionReceiptUrl ||
            currentReceivable.asaas_transaction_receipt_url || null,
          asaas_status: remotePayment.status ||
            currentReceivable.asaas_status || null,
          gateway_provider: "asaas",
          gateway_environment: environment,
          gateway_payment_method: normalizeGatewayPaymentMethod(
            remotePayment.billingType,
          ),
          gateway_payment_id: remotePayment.id ||
            currentReceivable.asaas_payment_id,
          gateway_customer_id: remotePayment.customer ||
            currentReceivable.gateway_customer_id || null,
          gateway_payment_link_id: currentReceivable.asaas_payment_link_id ||
            null,
          gateway_installment_id: remotePayment.installment ||
            remotePayment.installmentId ||
            currentReceivable.asaas_installment_id || null,
          gateway_invoice_url: remotePayment.invoiceUrl ||
            currentReceivable.asaas_invoice_url || null,
          gateway_bank_slip_url: remotePayment.bankSlipUrl ||
            currentReceivable.asaas_bank_slip_url || null,
          gateway_transaction_receipt_url:
            remotePayment.transactionReceiptUrl ||
            currentReceivable.asaas_transaction_receipt_url || null,
          gateway_status: remotePayment.status ||
            currentReceivable.asaas_status || null,
          gateway_fee_value: isEadCheckout
            ? (receivableFeeFields as any).asaas_fee_value
            : null,
          gateway_net_value: isEadCheckout
            ? (receivableFeeFields as any).asaas_net_value
            : null,
          gateway_synced_at: new Date().toISOString(),
          gateway_last_error: null,
          ...(isEadCheckout ? receivableFeeFields : {}),
          status: paid ? "PAGO" : currentReceivable.status,
          valor_pago: paid
            ? Number(remotePayment.value || currentReceivable.valor)
            : currentReceivable.valor_pago,
          data_pagamento: paid
            ? paymentDate(remotePayment)
            : currentReceivable.data_pagamento,
          forma_pagamento: paid
            ? mapBillingType(remotePayment.billingType)
            : currentReceivable.forma_pagamento,
          origem_pagamento: paid ? "ASAAS" : currentReceivable.origem_pagamento,
          asaas_synced_at: new Date().toISOString(),
          asaas_last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentReceivable.id)
        .select()
        .single();
      if (refreshError) throw refreshError;
      existingReceivable = refreshedReceivable;
      if (paid && !keepTechnicalDocumentationPending) {
        await admin.from("matriculas").update({ status: "ATIVO" }).eq(
          "id",
          matricula.id,
        );
      }
      return refreshedReceivable.asaas_invoice_url ||
        refreshedReceivable.asaas_bank_slip_url || null;
    } catch (paymentLookupError) {
      if ((paymentLookupError as Error & { status?: number })?.status === 404) {
        existingReceivable = await clearLocalAsaasPayment(
          currentReceivable.id,
          "Cobrança Asaas não localizada; será gerado novo checkout.",
        );
        return null;
      }
      throw paymentLookupError;
    }
  };

  return {
    callAsaas,
    recoverPaymentByReceivableId,
    ensureCustomer,
    persistGatewayTransaction,
    getReusableExistingPaymentUrl,
    getExistingReceivable: () => existingReceivable,
    setExistingReceivable: (receivable: any) => {
      existingReceivable = receivable;
    },
  };
};

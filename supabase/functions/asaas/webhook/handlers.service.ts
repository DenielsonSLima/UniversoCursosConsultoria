import {
  buildCoursePaymentDescription,
  mapBillingType,
  paymentDate,
  PENDENTE_INSCRICAO_STATUS,
} from "./shared.ts";
import {
  isOnlineCourseModality,
  isTecnicoCourseModality,
} from "../core/modality.ts";
import {
  applyReceivableSnapshotFields,
  applyRemoteIdentitySnapshot,
} from "../../gateways/checkout/remote-title-guard.ts";
import { isEnrollmentStatusEligibleForAutomaticActivation } from "../../gateways/webhook/domain/ead-enrollment.ts";
import { shouldPreserveReceivableAfterRefreshConflict } from "../api/billing-refresh-guard.ts";
import {
  type AsaasReceivableLookupSource,
  buildCanonicalAsaasWebhookFields,
  terminalReceivableConflictReason,
  validateAsaasWebhookPayment,
} from "./receivable-integrity.ts";
import {
  assertAsaasGatewayTransactionOwnership,
  loadAsaasGatewayTransaction,
  syncAsaasGatewayTransaction,
} from "./gateway-transaction.service.ts";
import {
  assertLegacyReceivableCompatibility,
  type LegacyCoursePaymentLinkProof,
  proveLegacyAsaasCustomer,
  proveLegacyCoursePaymentLink,
} from "./legacy-payment-link-integrity.ts";

type CallAsaas = (path: string, init?: RequestInit) => Promise<any>;
type GatewayEnvironment = "sandbox" | "production";
type SyncFutureInstallments = (matriculaId: string) => Promise<unknown>;

export const createAsaasWebhookHandlers = (
  admin: any,
  callAsaas: CallAsaas,
  environment: GatewayEnvironment,
  syncFutureInstallments: SyncFutureInstallments,
) => {
  const WEBHOOK_RECEIVABLE_CAS_FIELDS = [
    "status",
    "origem_pagamento",
    "updated_at",
    "asaas_status",
    "gateway_status",
    "nosso_numero_asaas",
    "asaas_installment_id",
    "gateway_customer_id",
    "gateway_installment_id",
    "valor",
    "valor_pago",
    "data_pagamento",
    "forma_pagamento",
  ] as const;

  const webhookReviewMessage = (
    eventType: string,
    paymentId: unknown,
    reason: string,
  ) =>
    [
      "REVISAO_ASAAS_WEBHOOK",
      eventType,
      paymentId ? `payment_id=${String(paymentId)}` : null,
      reason,
      "estado local preservado; exige conciliacao manual",
    ].filter(Boolean).join(" | ");

  const academicReviewMessage = (
    paymentId: unknown,
    enrollmentStatus: unknown,
    reason: string,
  ) =>
    [
      "REVISAO_ACADEMICA_ASAAS",
      paymentId ? `payment_id=${String(paymentId)}` : null,
      enrollmentStatus ? `matricula_status=${String(enrollmentStatus)}` : null,
      reason,
      "pagamento registrado sem reativacao automatica",
    ].filter(Boolean).join(" | ");

  const loadReceivable = async (receivableId: string) => {
    const { data, error } = await admin.from("contas_receber")
      .select("*")
      .eq("id", receivableId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Recebível Asaas não encontrado após concorrência.");
    }
    return data;
  };

  const findScopedReceivable = async (field: string, value: string) => {
    const { data, error } = await admin.from("contas_receber")
      .select("*")
      .eq("gateway_provider", "asaas")
      .eq("gateway_environment", environment)
      .eq(field, value)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  };

  const findReceivableForPayment = async (payment: any): Promise<
    {
      receivable: any;
      lookupSource: AsaasReceivableLookupSource;
    } | null
  > => {
    const paymentId = String(payment?.id || "").trim();
    if (!paymentId) return null;

    const gatewayReceivable = await findScopedReceivable(
      "gateway_payment_id",
      paymentId,
    );
    if (gatewayReceivable) {
      return {
        receivable: gatewayReceivable,
        lookupSource: "gateway_payment_id",
      };
    }

    const legacyReceivable = await findScopedReceivable(
      "asaas_payment_id",
      paymentId,
    );
    if (legacyReceivable) {
      return {
        receivable: legacyReceivable,
        lookupSource: "asaas_payment_id",
      };
    }

    const externalReference = String(payment?.externalReference || "").trim();
    if (!externalReference) return null;
    const referencedReceivable = await findScopedReceivable(
      "id",
      externalReference,
    );
    if (referencedReceivable) {
      return {
        receivable: referencedReceivable,
        lookupSource: "external_reference",
      };
    }

    // Consulta somente diagnóstica: confirma que o UUID existe, sem nunca o
    // adotar. Isso diferencia título inexistente de tentativa cross-provider
    // ou cross-environment e mantém o evento em revisão.
    const { data: unscoped, error: unscopedError } = await admin
      .from("contas_receber")
      .select("id, gateway_provider, gateway_environment")
      .eq("id", externalReference)
      .maybeSingle();
    if (unscopedError) throw unscopedError;
    if (unscoped) {
      throw new Error(
        webhookReviewMessage(
          "LOOKUP",
          paymentId,
          "externalReference pertence a outro provedor ou ambiente",
        ),
      );
    }
    return null;
  };

  const updateReceivableWithWebhookCas = async (
    snapshot: any,
    updates: Record<string, unknown>,
  ) => {
    let query = admin.from("contas_receber")
      .update(updates)
      .eq("id", snapshot.id);
    query = applyRemoteIdentitySnapshot(query, snapshot);
    query = applyReceivableSnapshotFields(
      query,
      snapshot,
      WEBHOOK_RECEIVABLE_CAS_FIELDS,
    );
    const { data, error } = await query.select().maybeSingle();
    if (error) throw error;
    return data;
  };

  const persistWebhookReview = async (
    snapshot: any,
    eventType: string,
    paymentId: unknown,
    reason: string,
  ) => {
    const message = webhookReviewMessage(eventType, paymentId, reason);
    const marked = await updateReceivableWithWebhookCas(snapshot, {
      asaas_last_error: message,
      ...(String(snapshot.gateway_provider || "").toLowerCase() === "asaas"
        ? { gateway_last_error: message }
        : {}),
      updated_at: new Date().toISOString(),
    });
    if (!marked) {
      throw new Error(
        `${message}. O recebível mudou novamente antes do registro da revisão.`,
      );
    }
    return marked;
  };

  const handleWebhookReceivableConflict = async (
    snapshot: any,
    eventType: string,
    paymentId: unknown,
    reason: string,
  ) => {
    const current = await loadReceivable(snapshot.id);
    const marked = await persistWebhookReview(
      current,
      eventType,
      paymentId,
      reason,
    );
    if (shouldPreserveReceivableAfterRefreshConflict(current)) return null;
    throw new Error(marked.asaas_last_error);
  };

  const persistAcademicReviewForReceivable = async (
    receivable: any,
    payment: any,
    enrollmentStatus: unknown,
    reason: string,
  ) => {
    const message = academicReviewMessage(
      payment?.id,
      enrollmentStatus,
      reason,
    );
    const marked = await updateReceivableWithWebhookCas(receivable, {
      asaas_last_error: message,
      ...(String(receivable.gateway_provider || "").toLowerCase() === "asaas"
        ? { gateway_last_error: message }
        : {}),
      updated_at: new Date().toISOString(),
    });
    if (!marked) {
      throw new Error(
        `${message}. O recebível mudou antes do registro da revisão acadêmica.`,
      );
    }
    return marked;
  };

  const upsertOnlineInscription = async (
    payload: {
      course: any;
      turma: any;
      aluno: any;
      matricula: any;
      customer?: any;
      payment: any;
      isConfirmed: boolean;
    },
  ) => {
    const cpfCnpj = String(
      payload.customer?.cpfCnpj || payload.aluno?.cpf_cnpj || "",
    ).replace(/\D/g, "");
    const status = payload.isConfirmed ? "PAGO" : PENDENTE_INSCRICAO_STATUS;
    const row = {
      curso_id: payload.course.id,
      turma_id: payload.turma.id,
      aluno_id: payload.aluno.id,
      matricula_id: payload.matricula.id,
      asaas_payment_id: payload.payment.id,
      asaas_customer_id: payload.customer?.id ||
        payload.aluno?.asaas_customer_id || payload.payment.customer || null,
      asaas_payment_link_id: payload.payment.paymentLink || null,
      nome: payload.customer?.name || payload.aluno.nome,
      cpf_cnpj: cpfCnpj || null,
      email: payload.customer?.email || payload.aluno.email || null,
      telefone: payload.customer?.mobilePhone || payload.customer?.phone ||
        payload.aluno.telefone || null,
      valor: Number(payload.payment.value || 0),
      status,
      pago_em: payload.isConfirmed ? new Date().toISOString() : null,
      confirmado_em: payload.isConfirmed ? new Date().toISOString() : null,
      forma_pagamento: payload.payment.billingType || null,
      erro: null,
      updated_at: new Date().toISOString(),
    };

    let existing: any = null;
    if (row.asaas_payment_id) {
      const { data, error } = await admin
        .from("inscricoes_online")
        .select("id")
        .eq("asaas_payment_id", row.asaas_payment_id)
        .maybeSingle();
      if (error) throw error;
      existing = data;
    }

    if (!existing?.id && row.matricula_id) {
      const { data, error } = await admin
        .from("inscricoes_online")
        .select("id")
        .eq("matricula_id", row.matricula_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      existing = data;
    }

    const query = existing?.id
      ? admin.from("inscricoes_online").update(row).eq("id", existing.id)
      : admin.from("inscricoes_online").insert(row);
    const { error } = await query;
    if (error) throw error;
  };

  const activateOnlineEnrollmentForReceivable = async (
    receivable: any,
    payment: any,
    localStatus: string | null,
  ) => {
    if (localStatus !== "PAGO" || !receivable?.matricula_id) return true;
    if (
      String(receivable?.tipo_lancamento || "").toUpperCase() !== "MATRICULA"
    ) return true;

    const { data: matricula, error: matriculaError } = await admin
      .from("matriculas")
      .select("*, turmas(*, cursos(id, nome, modalidade))")
      .eq("id", receivable.matricula_id)
      .maybeSingle();
    if (matriculaError) throw matriculaError;
    const course = matricula?.turmas?.cursos;
    if (!course || !isOnlineCourseModality(course.modalidade)) return true;
    const keepDocumentationPending = isTecnicoCourseModality(course.modalidade);
    const enrollmentStatus = String(matricula?.status || "").toUpperCase();
    if (
      enrollmentStatus !== "ATIVO" &&
      !isEnrollmentStatusEligibleForAutomaticActivation(enrollmentStatus)
    ) {
      await persistAcademicReviewForReceivable(
        receivable,
        payment,
        enrollmentStatus,
        "matrícula fora dos estados pendentes/aguardando; reativação bloqueada",
      );
      return false;
    }

    const { data: aluno, error: alunoError } = await admin
      .from("parceiros")
      .select("*")
      .eq("id", receivable.cliente_id || matricula.aluno_id)
      .maybeSingle();
    if (alunoError) throw alunoError;
    if (!aluno) {
      throw new Error(
        "Pagamento recebido, mas o aluno vinculado não foi encontrado.",
      );
    }

    if (!keepDocumentationPending && enrollmentStatus !== "ATIVO") {
      const { data: activated, error: enrollmentError } = await admin
        .from("matriculas")
        .update({ status: "ATIVO" })
        .eq("id", matricula.id)
        .eq("status", matricula.status)
        .select("id, status")
        .maybeSingle();
      if (enrollmentError) throw enrollmentError;
      if (!activated) {
        const { data: currentEnrollment, error: currentEnrollmentError } =
          await admin.from("matriculas")
            .select("id, status")
            .eq("id", matricula.id)
            .maybeSingle();
        if (currentEnrollmentError) throw currentEnrollmentError;
        if (
          String(currentEnrollment?.status || "").toUpperCase() !== "ATIVO"
        ) {
          await persistAcademicReviewForReceivable(
            receivable,
            payment,
            currentEnrollment?.status,
            "matrícula mudou durante a ativação automática; reativação bloqueada",
          );
          return false;
        }
      }
    }

    await upsertOnlineInscription({
      course,
      turma: matricula.turmas,
      aluno,
      matricula,
      payment,
      isConfirmed: true,
    });
    return true;
  };

  const cancelPendingOnlineEnrollmentForReceivable = async (
    receivable: any,
    eventType: string,
    localStatus: string | null,
  ) => {
    if (
      !["VENCIDO", "CANCELADO"].includes(
        String(localStatus || "").toUpperCase(),
      )
    ) return;
    if (!receivable?.matricula_id) return;
    if (
      String(receivable?.tipo_lancamento || "").toUpperCase() !== "MATRICULA"
    ) return;

    const { data: matricula, error: matriculaError } = await admin
      .from("matriculas")
      .select("id, status, turmas(cursos(id, modalidade))")
      .eq("id", receivable.matricula_id)
      .maybeSingle();
    if (matriculaError) throw matriculaError;
    const course = matricula?.turmas?.cursos;
    if (!course || !isOnlineCourseModality(course.modalidade)) return;
    const isEadCourse = String(course.modalidade || "").toUpperCase() === "EAD";

    const { data: paidReceivable, error: paidError } = await admin
      .from("contas_receber")
      .select("id")
      .eq("matricula_id", receivable.matricula_id)
      .eq("status", "PAGO")
      .limit(1)
      .maybeSingle();
    if (paidError) throw paidError;
    if (paidReceivable?.id) return;

    const reason = eventType === "PAYMENT_DELETED"
      ? "Checkout cancelado: cobrança removida no Asaas."
      : "Checkout cancelado: cobrança vencida no Asaas.";

    const { error: enrollmentError } = await admin
      .from("matriculas")
      .update({ status: "CANCELADO" })
      .eq("id", receivable.matricula_id)
      .in("status", [
        "PENDENTE",
        "AGUARDANDO_PAGAMENTO",
        "AGUARDANDO_CONFIRMACAO",
      ]);
    if (enrollmentError) throw enrollmentError;

    const { error: inscriptionError } = await admin
      .from("inscricoes_online")
      .update({
        status: "CANCELADO",
        erro: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("matricula_id", receivable.matricula_id)
      .eq("status", PENDENTE_INSCRICAO_STATUS);
    if (inscriptionError) throw inscriptionError;

    if (isEadCourse) {
      const { error: receivableError } = await admin
        .from("contas_receber")
        .update({
          status: "CANCELADO",
          asaas_last_error: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", receivable.id)
        .neq("status", "PAGO");
      if (receivableError) throw receivableError;
    }
  };

  const upsertReceivableFromPaymentLink = async (
    params: {
      course: any;
      turma: any;
      aluno: any;
      matricula: any;
      payment: any;
      isConfirmed: boolean;
      proof: LegacyCoursePaymentLinkProof;
    },
  ) => {
    const paid = params.isConfirmed;
    const syncedAt = new Date().toISOString();
    const receivablePayload = {
      polo_id: params.turma.polo_id,
      descricao: buildCoursePaymentDescription(params.course.nome),
      valor: params.proof.amount,
      data_vencimento: String(
        params.payment.dueDate || new Date().toISOString(),
      ).slice(0, 10),
      data_pagamento: paid ? paymentDate(params.payment) : null,
      valor_pago: paid ? params.proof.amount : null,
      status: paid ? "PAGO" : "PENDENTE",
      cliente_id: params.aluno.id,
      matricula_id: params.matricula.id,
      turma_id: params.turma.id,
      forma_pagamento: paid ? mapBillingType(params.payment.billingType) : null,
      categoria: "MENSALIDADE",
      tipo_lancamento: "MATRICULA",
      origem_pagamento: paid ? "ASAAS" : "ASAAS_ONLINE",
      asaas_payment_id: params.payment.id,
      asaas_payment_link_id: params.payment.paymentLink || null,
      nosso_numero_asaas: params.payment.id,
      asaas_invoice_url: params.payment.invoiceUrl || null,
      asaas_bank_slip_url: params.payment.bankSlipUrl || null,
      asaas_installment_id: params.payment.installment ||
        params.payment.installmentId || null,
      asaas_transaction_receipt_url: params.payment.transactionReceiptUrl ||
        null,
      asaas_status: params.payment.status || null,
      asaas_synced_at: syncedAt,
      asaas_last_error: null,
      gateway_provider: "asaas",
      gateway_environment: params.proof.environment,
      gateway_payment_method: params.proof.paymentMethod,
      gateway_payment_id: params.proof.paymentId,
      gateway_customer_id: params.proof.customerId,
      gateway_payment_link_id: params.proof.paymentLinkId,
      gateway_installment_id: params.payment.installment ||
        params.payment.installmentId || null,
      gateway_invoice_url: params.payment.invoiceUrl || null,
      gateway_bank_slip_url: params.payment.bankSlipUrl || null,
      gateway_transaction_receipt_url: params.payment.transactionReceiptUrl ||
        null,
      gateway_status: params.payment.status || null,
      gateway_synced_at: syncedAt,
      gateway_last_error: null,
      gateway_submission_channel: "API",
      gateway_submission_status: "API_REGISTERED",
      updated_at: syncedAt,
    };

    const { data: existing, error: existingError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("asaas_payment_id", params.proof.paymentId)
      .maybeSingle();
    if (existingError) throw existingError;

    const assertCompatible = (current: Record<string, unknown>) =>
      assertLegacyReceivableCompatibility({
        existing: current,
        proof: params.proof,
        alunoId: params.aluno.id,
        matriculaId: params.matricula.id,
        turmaId: params.turma.id,
      });

    const updateExisting = async (current: Record<string, unknown>) => {
      assertCompatible(current);
      let query = admin.from("contas_receber")
        .update(receivablePayload)
        .eq("id", current.id);
      query = applyRemoteIdentitySnapshot(query, current);
      query = applyReceivableSnapshotFields(query, current, [
        "status",
        "origem_pagamento",
        "valor",
        "valor_pago",
        "data_vencimento",
        "data_pagamento",
        "forma_pagamento",
        "categoria",
        "tipo_lancamento",
        "polo_id",
        "cliente_id",
        "matricula_id",
        "turma_id",
        "nosso_numero_asaas",
        "asaas_installment_id",
        "gateway_installment_id",
        "asaas_status",
        "gateway_status",
        "gateway_submission_channel",
        "gateway_submission_status",
        "updated_at",
      ]);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "REVISAO_ASAAS_LINK_LEGADO: recebivel mudou durante o retry; nenhum estado foi sobrescrito",
        );
      }
      return data;
    };

    if (existing) return await updateExisting(existing);

    const { data: inserted, error: insertError } = await admin
      .from("contas_receber")
      .insert(receivablePayload)
      .select("id")
      .maybeSingle();
    if (!insertError && inserted) return inserted;

    // Dois eventos validos podem disputar o primeiro INSERT. A restricao
    // unica escolhe o vencedor; o perdedor so adota a linha se toda a
    // identidade canonica continuar exatamente compativel.
    const { data: raced, error: raceError } = await admin
      .from("contas_receber")
      .select("*")
      .eq("asaas_payment_id", params.proof.paymentId)
      .maybeSingle();
    if (raceError) throw raceError;
    if (!raced) {
      throw insertError || new Error(
        "REVISAO_ASAAS_LINK_LEGADO: insert nao confirmou o recebivel e nenhum retry compativel foi encontrado",
      );
    }
    return await updateExisting(raced);
  };

  const syncOpenInstallments = async (matriculaId: string) => {
    await syncFutureInstallments(matriculaId);
  };

  const persistPaymentLinkAcademicReview = async (
    matriculaId: string,
    payment: any,
    enrollmentStatus: unknown,
    reason: string,
  ) => {
    const message = academicReviewMessage(
      payment?.id,
      enrollmentStatus,
      reason,
    );
    const now = new Date().toISOString();
    const { error: receivableError } = await admin.from("contas_receber")
      .update({ asaas_last_error: message, updated_at: now })
      .eq("asaas_payment_id", payment?.id || "");
    if (receivableError) throw receivableError;
    const { error: inscriptionError } = await admin.from("inscricoes_online")
      .update({ erro: message, updated_at: now })
      .eq("matricula_id", matriculaId)
      .eq("asaas_payment_id", payment?.id || "");
    if (inscriptionError) throw inscriptionError;
  };

  const handleReceivablePayment = async (
    payment: any,
    eventType: string,
    localStatus: string | null,
  ) => {
    const matched = await findReceivableForPayment(payment);
    if (!matched) return;
    const { receivable, lookupSource } = matched;

    const integrityError = validateAsaasWebhookPayment({
      receivable,
      payment,
      environment,
      lookupSource,
    });
    if (integrityError) {
      if (
        integrityError ===
          "externalReference não identifica exatamente o recebível" &&
        payment?.paymentLink && payment?.externalReference
      ) {
        const { data: legacyCourse, error: legacyCourseError } = await admin
          .from("cursos")
          .select("id")
          .eq("id", String(payment.externalReference))
          .eq("asaas_payment_link_id", String(payment.paymentLink))
          .maybeSingle();
        if (legacyCourseError) throw legacyCourseError;
        if (legacyCourse?.id) {
          // O externalReference dos links historicos aponta para o curso, nao
          // para o recebivel criado no primeiro evento. Apenas adia o evento
          // para o validador legado abaixo; nenhuma baixa e feita aqui.
          return;
        }
      }
      const marked = await persistWebhookReview(
        receivable,
        eventType,
        payment.id,
        integrityError,
      );
      throw new Error(marked.asaas_last_error);
    }

    const existingTransaction = await (async () => {
      try {
        const transaction = await loadAsaasGatewayTransaction(
          admin,
          environment,
          String(payment.id),
        );
        assertAsaasGatewayTransactionOwnership(transaction, receivable.id);
        return transaction;
      } catch (error) {
        const marked = await persistWebhookReview(
          receivable,
          eventType,
          payment.id,
          error instanceof Error ? error.message : String(error),
        );
        throw new Error(marked.asaas_last_error, { cause: error });
      }
    })();

    const syncedAt = new Date().toISOString();
    const canonicalFields = buildCanonicalAsaasWebhookFields({
      receivable,
      payment,
      environment,
      eventType,
      syncedAt,
      transactionStatus: existingTransaction?.remote_status,
    });
    const currentStatus = String(receivable.status || "").toUpperCase();
    const currentManualSettlement = currentStatus === "PAGO" &&
      String(receivable.origem_pagamento || "").toUpperCase() ===
        "PRESENCIAL";
    const preservationReason = currentManualSettlement && localStatus === "PAGO"
      ? "pagamento remoto recebido após baixa manual; revisar possível recebimento duplicado"
      : terminalReceivableConflictReason(receivable, localStatus);

    if (preservationReason) {
      const reviewMessage = webhookReviewMessage(
        eventType,
        payment.id,
        preservationReason,
      );
      const preservationUpdates = {
        ...canonicalFields,
        asaas_last_error: reviewMessage,
        gateway_last_error: reviewMessage,
        updated_at: syncedAt,
      };
      const projectedPreserved = { ...receivable, ...preservationUpdates };
      try {
        await syncAsaasGatewayTransaction({
          admin,
          environment,
          receivable: projectedPreserved,
          payment,
          syncedAt,
          existing: existingTransaction,
        });
      } catch (error) {
        const marked = await persistWebhookReview(
          receivable,
          eventType,
          payment.id,
          error instanceof Error ? error.message : String(error),
        );
        throw new Error(marked.asaas_last_error, { cause: error });
      }

      const preserved = await updateReceivableWithWebhookCas(
        receivable,
        preservationUpdates,
      );
      if (!preserved) {
        await handleWebhookReceivableConflict(
          receivable,
          eventType,
          payment.id,
          "recebível mudou antes de preservar seu estado terminal",
        );
        return;
      }
      return;
    }

    const updates: Record<string, unknown> = { ...canonicalFields };
    if (localStatus && localStatus !== "AGUARDANDO_CONFIRMACAO") {
      updates.status = localStatus;
    }
    if (localStatus === "PAGO") {
      updates.valor_pago = Number(payment.value);
      updates.data_pagamento = String(
        payment.paymentDate || payment.clientPaymentDate ||
          payment.confirmedDate ||
          new Date().toISOString(),
      ).slice(0, 10);
      updates.forma_pagamento = payment.billingType === "CREDIT_CARD"
        ? "CARTAO"
        : payment.billingType;
      updates.origem_pagamento = "ASAAS";
    }
    if (eventType === "PAYMENT_OVERDUE" && localStatus === "VENCIDO") {
      updates.status = "VENCIDO";
    }

    // Confirme primeiro a projeção canônica do pagamento. Assim nenhuma falha
    // ou disputa de ownership em payment_gateway_transactions pode deixar o
    // recebível como PAGO sem a trilha bancária correspondente. O snapshot
    // projetado contém exatamente os campos que o CAS local tentará aplicar.
    const projectedReceivable = { ...receivable, ...updates };
    try {
      await syncAsaasGatewayTransaction({
        admin,
        environment,
        receivable: projectedReceivable,
        payment,
        syncedAt,
        existing: existingTransaction,
      });
    } catch (error) {
      const marked = await persistWebhookReview(
        receivable,
        eventType,
        payment.id,
        error instanceof Error ? error.message : String(error),
      );
      throw new Error(marked.asaas_last_error, { cause: error });
    }

    const updatedReceivable = await updateReceivableWithWebhookCas(
      receivable,
      updates,
    );
    if (!updatedReceivable) {
      await handleWebhookReceivableConflict(
        receivable,
        eventType,
        payment.id,
        "recebível mudou antes de aplicar o evento remoto",
      );
      return;
    }

    const enrollmentAllowsFinancialContinuation =
      await activateOnlineEnrollmentForReceivable(
        updatedReceivable,
        payment,
        localStatus,
      );
    await cancelPendingOnlineEnrollmentForReceivable(
      updatedReceivable,
      eventType,
      localStatus,
    );

    if (
      updatedReceivable.matricula_id && localStatus === "PAGO" &&
      enrollmentAllowsFinancialContinuation
    ) {
      await syncOpenInstallments(updatedReceivable.matricula_id);
    }
  };

  const handlePaymentLinkPayment = async (
    payment: any,
    eventType: string,
    localStatus: string | null,
    isPaymentConfirmed: boolean,
  ) => {
    if (
      !["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(eventType) ||
      !payment.paymentLink
    ) return;

    const isConfirmed = localStatus === "PAGO" || isPaymentConfirmed;
    const { data: course, error: courseError } = await admin.from("cursos")
      .select(
        "id, nome, modalidade, valor, financeiro_config, asaas_payment_link_id",
      )
      .eq("asaas_payment_link_id", payment.paymentLink)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) return;

    let remoteLink: Record<string, unknown>;
    try {
      remoteLink = await callAsaas(
        `/paymentLinks/${encodeURIComponent(String(payment.paymentLink))}`,
      );
    } catch {
      throw new Error(
        `REVISAO_ASAAS_LINK_LEGADO: link nao foi comprovado no ambiente ${environment}; nenhum pagamento ou ativacao foi aplicado`,
      );
    }
    const proof = proveLegacyCoursePaymentLink({
      course,
      payment,
      remoteLink,
      environment,
    });

    const customer = await callAsaas(`/customers/${payment.customer}`);
    const customerProof = proveLegacyAsaasCustomer({
      paymentCustomerId: proof.customerId,
      customer,
    });
    const cpfCnpj = customerProof.cpfCnpj;
    const { data: existingAluno, error: existingAlunoError } = await admin
      .from("parceiros")
      .select("*")
      .eq("cpf_cnpj", cpfCnpj)
      .maybeSingle();
    if (existingAlunoError) throw existingAlunoError;
    let aluno: any = existingAluno;
    if (
      aluno?.asaas_customer_id &&
      String(aluno.asaas_customer_id) !== customerProof.customerId
    ) {
      throw new Error(
        "REVISAO_ASAAS_LINK_LEGADO: CPF/CNPJ local pertence a outro cliente Asaas; nenhum pagamento ou ativacao foi aplicado",
      );
    }
    if (!aluno) {
      const { data, error } = await admin.from("parceiros").insert({
        tipo: "Aluno",
        nome: customer.name,
        cpf_cnpj: cpfCnpj || null,
        email: customer.email || null,
        telefone: customer.mobilePhone || customer.phone || null,
        cep: customer.postalCode || null,
        endereco: customer.address || null,
        numero: customer.addressNumber || null,
        complemento: customer.complement || null,
        bairro: customer.province || null,
        cidade: customer.cityName || null,
        status: "ATIVO",
        asaas_customer_id: customer.id,
      }).select().single();
      if (error) throw error;
      aluno = data;
    } else if (!aluno.asaas_customer_id) {
      const { data: linkedAluno, error: linkedAlunoError } = await admin
        .from("parceiros")
        .update({ asaas_customer_id: customerProof.customerId })
        .eq("id", aluno.id)
        .is("asaas_customer_id", null)
        .select("id, asaas_customer_id")
        .maybeSingle();
      if (linkedAlunoError) throw linkedAlunoError;
      if (!linkedAluno) {
        const { data: currentAluno, error: currentAlunoError } = await admin
          .from("parceiros")
          .select("id, asaas_customer_id")
          .eq("id", aluno.id)
          .maybeSingle();
        if (currentAlunoError) throw currentAlunoError;
        if (
          String(currentAluno?.asaas_customer_id || "") !==
            customerProof.customerId
        ) {
          throw new Error(
            "REVISAO_ASAAS_LINK_LEGADO: aluno mudou durante o vinculo com o cliente Asaas; nenhum pagamento ou ativacao foi aplicado",
          );
        }
        aluno = { ...aluno, ...currentAluno };
      } else {
        aluno = { ...aluno, ...linkedAluno };
      }
    }

    let turmaQuery = admin.from("turmas")
      .select("id, polo_id")
      .eq("curso_id", course.id);
    turmaQuery = isTecnicoCourseModality(course.modalidade)
      ? turmaQuery.in("status", ["INSCRICOES_ABERTAS", "EM_ANDAMENTO"])
      : turmaQuery.eq("status", "EM_ANDAMENTO");
    const { data: eligibleTurmas, error: turmaError } = await turmaQuery
      .limit(2);
    if (turmaError) throw turmaError;
    if (!Array.isArray(eligibleTurmas) || eligibleTurmas.length !== 1) {
      throw new Error(
        `REVISAO_ASAAS_LINK_LEGADO: esperado exatamente uma turma elegivel, encontradas ${
          Array.isArray(eligibleTurmas) ? eligibleTurmas.length : 0
        }; nenhum pagamento ou ativacao foi aplicado`,
      );
    }
    const turma = eligibleTurmas[0];

    const { data: existing, error: existingEnrollmentError } = await admin
      .from("matriculas")
      .select("*")
      .eq("aluno_id", aluno.id)
      .eq("turma_id", turma.id)
      .maybeSingle();
    if (existingEnrollmentError) throw existingEnrollmentError;
    let matricula: any = existing;
    if (!matricula) {
      const { data, error } = await admin.from("matriculas").insert({
        aluno_id: aluno.id,
        turma_id: turma.id,
        status: "PENDENTE",
      }).select().single();
      if (error) throw error;
      matricula = data;
    }

    // Registra primeiro o pagamento validado. Assim uma falha financeira nao
    // deixa a matricula ativa sem o recebivel canonico correspondente.
    await upsertReceivableFromPaymentLink({
      course,
      turma,
      aluno,
      matricula,
      payment,
      isConfirmed,
      proof,
    });

    let activationAllowed = true;
    let activationReviewReason: string | null = null;
    let activationReviewStatus: unknown = matricula.status;
    if (isConfirmed) {
      const enrollmentStatus = String(matricula.status || "").toUpperCase();
      if (
        enrollmentStatus !== "ATIVO" &&
        !isEnrollmentStatusEligibleForAutomaticActivation(enrollmentStatus)
      ) {
        activationAllowed = false;
        activationReviewReason =
          "matrícula existente fora dos estados pendentes/aguardando; reativação por link bloqueada";
      } else if (
        enrollmentStatus !== "ATIVO" &&
        !isTecnicoCourseModality(course.modalidade)
      ) {
        const { data: activated, error: activationError } = await admin
          .from("matriculas")
          .update({ status: "ATIVO" })
          .eq("id", matricula.id)
          .eq("status", matricula.status)
          .select("id, status")
          .maybeSingle();
        if (activationError) throw activationError;
        if (activated) {
          matricula = { ...matricula, ...activated };
        } else {
          const { data: currentEnrollment, error: currentEnrollmentError } =
            await admin.from("matriculas")
              .select("id, status")
              .eq("id", matricula.id)
              .maybeSingle();
          if (currentEnrollmentError) throw currentEnrollmentError;
          activationReviewStatus = currentEnrollment?.status;
          if (
            String(currentEnrollment?.status || "").toUpperCase() !== "ATIVO"
          ) {
            activationAllowed = false;
            activationReviewReason =
              "matrícula mudou durante a ativação por link; reativação bloqueada";
          }
        }
      }
    }

    await upsertOnlineInscription({
      course,
      turma,
      aluno,
      matricula,
      customer,
      payment,
      isConfirmed,
    });
    if (activationReviewReason) {
      await persistPaymentLinkAcademicReview(
        matricula.id,
        payment,
        activationReviewStatus,
        activationReviewReason,
      );
    }
    if (isConfirmed && activationAllowed) {
      const { error: parcelasError } = await admin.rpc(
        "gerar_parcelas_matricula",
        {
          p_matricula_id: matricula.id,
        },
      );
      if (parcelasError) throw parcelasError;
      await syncOpenInstallments(matricula.id);
    }
  };

  return {
    handlePaymentLinkPayment,
    handleReceivablePayment,
  };
};

import { createIndividualLedgerAccess } from "./queue-bridge.ts";
import {
  assertOwnedIndividualCancellation,
  buildIndividualCancellationInput,
} from "./cancellation-review.ts";
import {
  createNationalProductionRelayTransport,
  type ProductionRelayConfig,
} from "../_shared/nfse-national/production-relay.ts";
import {
  createNationalProductionIssuer,
  productionErrorCode,
} from "../_shared/nfse-national/production.ts";
import { createNationalProductionCancellation } from "../_shared/nfse-national/production-cancellation.ts";
import { createProductionNumericSeriesCompatibilityValidator } from "../_shared/nfse-national/production-schema.ts";
import {
  assertNationalProductionContract,
  assessNationalProductionContract,
  type ProductionContractEvidence,
} from "../_shared/nfse-national/production-live-contract.ts";
import type {
  PreparedProductionCancellation,
  PreparedProductionDps,
} from "../_shared/nfse-national/production.types.ts";
import type { NationalDpsInput } from "../_shared/nfse-national/dps.types.ts";
import { buildNationalDps } from "../_shared/nfse-national/dps.ts";
import { parseFiscalJson } from "../_shared/nfse-national/pilot-codec.ts";
import {
  NfseContractError,
  requireContract,
} from "../_shared/nfse-national/xml.ts";
import type { CancellationInput } from "../_shared/nfse-national/events.ts";
import type { IndividualCommand } from "./contract.ts";
import type {
  CancellationRow,
  IndividualDependencies,
  IndividualRow,
} from "./handler.ts";
import {
  assessIndividualDps,
  buildIndividualDps,
  individualPublicPayload,
} from "./adapter.ts";
type Data = Record<string, unknown>;
interface Material {
  actorId: string;
  contextKey: string;
  poloId: string;
  environment: "PRODUCAO";
  month: string;
  configurationVersion: number;
  issuer: { cnpj: string };
  certificate: { fingerprint: string; notBefore: string; expiresAt: string };
  material: { certificatePem: string; chainPem: string; privateKeyPem: string };
}
interface RuntimeOptions {
  rpc(name: string, args: Data): Promise<{ data: unknown; error: unknown }>;
  authorize: IndividualDependencies["authorize"];
  respond: IndividualDependencies["respond"];
  rateLimited: IndividualDependencies["rateLimited"];
}
const object = (v: unknown): Data =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Data : {};
const base = (command: IndividualCommand, actor: string) => ({
  p_actor_id: actor,
  p_context_key: command.scope.contextKey,
  p_polo_id: command.scope.poloId,
  p_environment: command.scope.environment,
  p_month: command.scope.month,
});
/** Per-request closure. It never caches A1 material across HTTP requests. */
export function createIndividualRuntime(
  options: RuntimeOptions,
): { dependencies: IndividualDependencies; close(): void } {
  const contexts = new Map<
    string,
    Promise<Awaited<ReturnType<typeof loadContext>>>
  >();
  const transports: ReturnType<
    typeof createNationalProductionRelayTransport
  >[] = [];
  async function rpc(name: string, args: Data, code: string): Promise<unknown> {
    const result = await options.rpc(name, args);
    if (result.error || !result.data) throw new NfseContractError(code);
    return result.data;
  }
  async function loadContext(command: IndividualCommand, actor: string) {
    const material = await rpc(
      "get_nfse_production_material_internal",
      base(command, actor),
      "PRODUCTION_CREDENTIAL_UNAVAILABLE",
    ) as Material;
    requireContract(
      material.actorId === actor &&
        Object.entries(command.scope).every(([key, value]) =>
          object(material)[key] === value
        ),
      "PRODUCTION_CREDENTIAL_SCOPE_MISMATCH",
    );
    const time = Date.now();
    requireContract(
      Number.isFinite(Date.parse(material.certificate.notBefore)) &&
        Number.isFinite(Date.parse(material.certificate.expiresAt)) &&
        Date.parse(material.certificate.notBefore) <= time &&
        Date.parse(material.certificate.expiresAt) > time,
      "PRODUCTION_CERTIFICATE_EXPIRED",
    );
    const config = await rpc(
      "get_nfse_production_relay_config_internal",
      base(command, actor),
      "PRODUCTION_RELAY_UNAVAILABLE",
    ) as ProductionRelayConfig;
    let postPermission: "ISSUE" | "CANCEL" | null = null;
    const transport = createNationalProductionRelayTransport(
      config,
      material.material,
      {
        assertPostAllowed() {
          requireContract(
            postPermission !== null,
            "PRODUCTION_DISPATCH_LEASE_REQUIRED",
          );
          requireContract(evidence !== null, "PRODUCTION_MTLS_SPEC_UNVERIFIED");
          assertNationalProductionContract(evidence, postPermission);
        },
      },
    );
    transports.push(transport);
    let evidence: ProductionContractEvidence | null = null;
    for (const path of ["/swagger/docs/v1", "/swagger/v1/swagger.json"]) {
      try {
        const response = await transport.request("GET", path);
        if (response.status !== 200) continue;
        evidence = {
          environment: "PRODUCAO",
          checkedAt: new Date().toISOString(),
          status: 200,
          tlsVerified: true,
          certificateValid: true,
          url: `https://sefin.nfse.gov.br/SefinNacional${path}`,
          specification: parseFiscalJson(response.body),
        };
        break;
      } catch {
        /* Try only the second official read-only specification route. */
      }
    }
    requireContract(evidence !== null, "PRODUCTION_MTLS_SPEC_UNVERIFIED");
    const proof: ProductionContractEvidence = evidence;
    const assessment = assessNationalProductionContract(proof);
    const common = {
      credential: material.material,
      signatureProfile: assessment.profile,
      transport,
      schema: createProductionNumericSeriesCompatibilityValidator(),
      assertLiveContract: (operation: "ISSUE" | "CANCEL") =>
        assertNationalProductionContract(proof, operation),
    };
    return {
      material,
      assessment,
      issuer: createNationalProductionIssuer(common),
      cancellation: (operation: IndividualRow, row: CancellationRow) => {
        requireContract(
          assessment.eventContract !== null,
          "PRODUCTION_EVENT_JSON_CONTRACT_UNVERIFIED",
        );
        return createNationalProductionCancellation({
          ...common,
          eventContract: assessment.eventContract,
          assertCancellationAllowed() {
            assertOwnedIndividualCancellation(
              operation,
              row,
              material.issuer.cnpj,
            );
          },
        });
      },
      allowPost(operation: "ISSUE" | "CANCEL", lease: boolean) {
        requireContract(lease, "PRODUCTION_DISPATCH_LEASE_REQUIRED");
        assertNationalProductionContract(proof, operation);
        postPermission = operation;
      },
    };
  }
  function context(command: IndividualCommand, actor: string) {
    const key = JSON.stringify([actor, command.scope]);
    let result = contexts.get(key);
    if (!result) {
      result = loadContext(command, actor);
      contexts.set(key, result);
    }
    return result;
  }
  function issuerMatches(
    row: IndividualRow,
    material: Material,
    reconcile: boolean,
  ) {
    const cnpj = String(object(object(row.snapshot).issuer).cnpj || "").replace(
      /\D/g,
      "",
    );
    requireContract(material.issuer.cnpj === cnpj, "PRODUCTION_ISSUER_CHANGED");
    if (!reconcile) {
      requireContract(
        material.configurationVersion === row.configurationVersion &&
          material.certificate.fingerprint === row.certificateFingerprint,
        "PRODUCTION_REVIEW_CHANGED",
      );
    }
  }
  async function ownCancellationOperation(
    command: IndividualCommand,
    actor: string,
    row: CancellationRow,
  ): Promise<IndividualRow> {
    const operation = await rpc("nfse_individual_operation_internal", {
      ...base(command, actor),
      p_request_id: command.requestId,
      p_action: "READ",
      p_preview_id: row.previewId,
      p_input: null,
    }, "PRODUCTION_OWN_AUTHORIZED_DOCUMENT_REQUIRED") as IndividualRow;
    const ctx = await context(command, actor);
    assertOwnedIndividualCancellation(operation, row, ctx.material.issuer.cnpj);
    return operation;
  }
  async function resolveRecipientMunicipality(
    row: IndividualRow,
  ): Promise<string | undefined> {
    const snapshot = object(row.snapshot),
      definition = object(object(snapshot.model).definition);
    if (
      object(definition.peopleOptions).recipientAddressSource !== "FROM_PARTNER"
    ) return undefined;
    const address = object(object(snapshot.recipient).address),
      state = String(address.state || "").trim().toUpperCase();
    const city = String(address.city || "").trim();
    requireContract(
      /^[A-Z]{2}$/.test(state) && city.length >= 2,
      "FISCAL_RECIPIENT_ADDRESS_REVIEW_REQUIRED",
    );
    const result = await rpc("buscar_municipios_ibge", {
      p_busca: `${city} ${state}`,
      p_limite: 30,
    }, "FISCAL_RECIPIENT_MUNICIPALITY_UNRESOLVED");
    const normalize = (value: unknown) =>
      String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .trim().toUpperCase();
    const matches = (Array.isArray(result) ? result : []).map(object).filter(
      (item) =>
        normalize(item.nome) === normalize(city) &&
        String(item.uf).toUpperCase() === state &&
        /^\d{7}$/.test(String(item.codigo_ibge)),
    );
    requireContract(
      matches.length === 1,
      "FISCAL_RECIPIENT_MUNICIPALITY_UNRESOLVED",
    );
    return String(matches[0].codigo_ibge);
  }
  const dependencies: IndividualDependencies = {
    ...options,
    payload: individualPublicPayload,
    ...createIndividualLedgerAccess(rpc),
    async capability(command, actor, row) {
      const cancel = "cancelPreviewId" in row;
      if (row.state !== "PREVIEWED") {
        return {
          available: false,
          reason: "PRODUCTION_OPERATION_ALREADY_DISPATCHED",
        };
      }
      if (Date.parse(row.expiresAt) <= Date.now()) {
        return {
          available: false,
          reason: "PRODUCTION_PREVIEW_EXPIRED",
        };
      }
      try {
        if (!cancel) {
          const check = assessIndividualDps(
            row as IndividualRow,
            await resolveRecipientMunicipality(row as IndividualRow),
          );
          if (!check.available) return check;
        }
        const ctx = await context(command, actor);
        if (cancel) {
          await ownCancellationOperation(
            command,
            actor,
            row as CancellationRow,
          );
          return {
            available: ctx.assessment.cancellationAvailable,
            reason: ctx.assessment.cancellationReason,
          };
        }
        issuerMatches(row as IndividualRow, ctx.material, false);
        return {
          available: ctx.assessment.issueAvailable,
          reason: ctx.assessment.issueReason,
        };
      } catch (error) {
        return { available: false, reason: productionErrorCode(error) };
      }
    },
    async prepare(command, actor, row) {
      const ctx = await context(command, actor);
      issuerMatches(row, ctx.material, false);
      const input = buildIndividualDps(
        row,
        await resolveRecipientMunicipality(row),
      );
      const prepared = await ctx.issuer.prepare(
        input,
        buildNationalDps(input).referenceId,
      );
      return {
        fiscalInput: prepared.input,
        dpsId: prepared.dpsId,
        signedDpsXml: prepared.signedDpsXml,
      };
    },
    async execute(command, actor, row, reconcile) {
      const ctx = await context(command, actor);
      issuerMatches(row, ctx.material, reconcile);
      requireContract(
        row.fiscalInput && row.dpsId && row.signedDpsXml,
        "PRODUCTION_PREPARED_DPS_REQUIRED",
      );
      const prepared: PreparedProductionDps = {
        input: row.fiscalInput as NationalDpsInput,
        dpsId: row.dpsId,
        signedDpsXml: row.signedDpsXml,
      };
      if (!reconcile) ctx.allowPost("ISSUE", row.dispatch);
      return await (reconcile
        ? ctx.issuer.reconcile(prepared)
        : ctx.issuer.issue(prepared));
    },
    async prepareCancellation(command, actor, row) {
      const ctx = await context(command, actor);
      requireContract(
        ctx.material.issuer.cnpj === row.issuerCnpj,
        "PRODUCTION_ISSUER_CHANGED",
      );
      const input = buildIndividualCancellationInput(row);
      const prepared = await ctx.cancellation(
        await ownCancellationOperation(command, actor, row),
        row,
      ).prepare(input);
      return {
        eventInput: prepared.input,
        eventReferenceId: prepared.eventReferenceId,
        signedEventXml: prepared.signedEventXml,
      };
    },
    async executeCancellation(command, actor, row, reconcile) {
      const ctx = await context(command, actor);
      requireContract(
        ctx.material.issuer.cnpj === row.issuerCnpj,
        "PRODUCTION_ISSUER_CHANGED",
      );
      requireContract(
        row.eventInput && row.signedEventXml,
        "PRODUCTION_PREPARED_EVENT_REQUIRED",
      );
      const prepared: PreparedProductionCancellation = {
        input: row.eventInput as CancellationInput,
        eventReferenceId: row.eventReferenceId,
        signedEventXml: row.signedEventXml,
      };
      if (!reconcile) ctx.allowPost("CANCEL", row.dispatch);
      const executor = ctx.cancellation(
        await ownCancellationOperation(command, actor, row),
        row,
      );
      const result =
        await (reconcile
          ? executor.reconcile(prepared)
          : executor.cancel(prepared));
      if (
        result.state === "CONFIRMED"
      ) {
        return result.cancellationState === "CANCELLED"
          ? { ...result, state: "CANCELLED" }
          : {
            state: "CANCELLATION_PENDING",
            accessKey: row.accessKey,
            code: "CANCELLATION_STATE_UNCONFIRMED",
          };
      }
      if (result.state === "REJECTED") {
        return {
          ...result,
          state: "CANCELLATION_REJECTED",
        };
      }
      if (result.state === "AWAITING_CONFIRMATION") {
        return {
          ...result,
          state: "CANCELLATION_PENDING",
        };
      }
      return result;
    },
  };
  return {
    dependencies,
    close() {
      for (const transport of transports) transport.close();
      contexts.clear();
    },
  };
}

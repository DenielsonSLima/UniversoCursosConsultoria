import type { GestorAutorizado } from "../../_shared/authz.ts";

type IssuerCandidate = {
  id: string;
  company_id: string;
  nome: string;
  cnpj: string;
  cidade: string;
  estado: string;
  status: string;
  is_matriz: boolean;
  empresas?: {
    id?: string;
    nome_fantasia?: string;
    razao_social?: string;
    cnpj?: string;
  } | null;
};

const candidateRow = (candidate: IssuerCandidate) => ({
  id: candidate.id,
  company_id: candidate.company_id,
  nome: candidate.nome,
  cnpj: candidate.cnpj,
  cidade: candidate.cidade,
  estado: candidate.estado,
  status: candidate.status,
  is_matriz: candidate.is_matriz === true,
  company: candidate.empresas
    ? {
      id: candidate.empresas.id || candidate.company_id,
      name: candidate.empresas.nome_fantasia ||
        candidate.empresas.razao_social ||
        null,
      legal_name: candidate.empresas.razao_social || null,
      cnpj: candidate.empresas.cnpj || null,
    }
    : null,
});

export const getPaymentIssuerOverview = async (admin: any) => {
  const [configResult, candidatesResult, activePolosResult] = await Promise.all([
    admin
      .from("payment_gateway_issuer_config")
      .select("id, issuer_polo_id, applies_to_all_polos, active, updated_at")
      .eq("id", 1)
      .maybeSingle(),
    admin
      .from("polos")
      .select(
        "id, company_id, nome, cnpj, cidade, estado, status, is_matriz, empresas(id, nome_fantasia, razao_social, cnpj)",
      )
      .eq("is_matriz", true)
      .eq("status", "ativo")
      .order("created_at", { ascending: true }),
    admin
      .from("polos")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo"),
  ]);

  if (configResult.error) throw configResult.error;
  if (candidatesResult.error) throw candidatesResult.error;
  if (activePolosResult.error) throw activePolosResult.error;

  const candidates = (candidatesResult.data || []).map(candidateRow);
  const configuredIssuer = candidates.find(
    (candidate: { id: string }) =>
      candidate.id === configResult.data?.issuer_polo_id,
  ) || null;

  return {
    config: configResult.data
      ? {
        id: configResult.data.id,
        issuer_polo_id: configResult.data.issuer_polo_id,
        applies_to_all_polos:
          configResult.data.applies_to_all_polos === true,
        active: configResult.data.active === true,
        updated_at: configResult.data.updated_at,
        issuer: configuredIssuer,
      }
      : null,
    candidates,
    active_polos_count: activePolosResult.count || 0,
  };
};

export const savePaymentIssuer = async (
  admin: any,
  gestor: GestorAutorizado,
  issuerPoloId: unknown,
) => {
  const normalizedIssuerPoloId = String(issuerPoloId || "").trim();
  if (!normalizedIssuerPoloId) {
    throw new Error("Selecione o polo matriz que emitira as cobrancas.");
  }

  const { data: issuer, error: issuerError } = await admin
    .from("polos")
    .select(
      "id, company_id, nome, cnpj, cidade, estado, status, is_matriz, empresas(id, nome_fantasia, razao_social, cnpj)",
    )
    .eq("id", normalizedIssuerPoloId)
    .maybeSingle();
  if (issuerError) throw issuerError;
  if (!issuer) throw new Error("O polo emissor informado nao existe.");
  if (issuer.is_matriz !== true) {
    throw new Error("O emissor financeiro deve ser o polo matriz.");
  }
  if (String(issuer.status || "").toLowerCase() !== "ativo") {
    throw new Error("O polo matriz precisa estar ativo para emitir cobrancas.");
  }

  const { data, error } = await admin
    .from("payment_gateway_issuer_config")
    .upsert({
      id: 1,
      issuer_polo_id: issuer.id,
      applies_to_all_polos: true,
      active: true,
      updated_by: gestor.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("id, issuer_polo_id, applies_to_all_polos, active, updated_at")
    .single();
  if (error) throw error;

  return {
    ...data,
    issuer: candidateRow(issuer),
  };
};

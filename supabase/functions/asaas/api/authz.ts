export interface GestorAutorizado {
  id: string;
  email: string;
  perfil: string | null;
  status: string | null;
  context: string | null;
  isGlobal: boolean;
  poloId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const isActiveStatus = (status: unknown) =>
  ["ativo", "active"].includes(normalize(status));

const isFinanceWriteProfile = (perfil: unknown) =>
  ["gestor", "financeiro"].includes(normalize(perfil));

export const bearerTokenFromRequest = (req: Request) =>
  (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

export const requireGestorAtivo = async (req: Request, admin: any): Promise<GestorAutorizado> => {
  const token = bearerTokenFromRequest(req);
  if (!token) throw new Error("Autenticacao obrigatoria para esta acao financeira.");

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const email = authData?.user?.email ? String(authData.user.email).trim().toLowerCase() : "";
  if (authError || !email) {
    throw new Error("Sessao invalida para esta acao financeira.");
  }

  const { data: usuario, error: usuarioError } = await admin
    .from("usuarios_sistema")
    .select("id, email, perfil, status, context")
    .ilike("email", email)
    .maybeSingle();
  if (usuarioError) throw usuarioError;
  if (!usuario || !isActiveStatus(usuario.status)) {
    throw new Error("Apenas usuario interno ativo pode executar esta acao financeira.");
  }

  const context = usuario.context ? String(usuario.context).trim() : null;
  let isGlobal = normalize(context) === "global";
  let poloId: string | null = UUID_RE.test(context || "") ? context : null;

  if (poloId) {
    const { data: polo, error: poloError } = await admin
      .from("polos")
      .select("id, is_matriz")
      .eq("id", poloId)
      .maybeSingle();
    if (poloError) throw poloError;
    if (polo?.is_matriz === true) isGlobal = true;
  }

  return {
    id: usuario.id,
    email,
    perfil: usuario.perfil || null,
    status: usuario.status || null,
    context,
    isGlobal,
    poloId,
  };
};

export const requireGestorGlobal = (gestor: GestorAutorizado) => {
  if (!gestor.isGlobal || normalize(gestor.perfil) !== "gestor") {
    throw new Error("Apenas gestor global pode alterar a configuracao do Asaas.");
  }
};

export const requireFinanceWriteAccess = (gestor: GestorAutorizado) => {
  if (!isFinanceWriteProfile(gestor.perfil)) {
    throw new Error("Apenas gestor ou financeiro ativo pode executar esta movimentacao financeira.");
  }
};

export const requireGestorForPolo = (gestor: GestorAutorizado, poloId?: string | null) => {
  if (gestor.isGlobal) return;
  if (!poloId) {
    throw new Error("Cobrança sem polo definido não pode ser movimentada por usuário de polo.");
  }
  if (gestor.poloId === poloId) return;
  throw new Error("Gestor sem permissao para movimentar cobranca deste polo.");
};

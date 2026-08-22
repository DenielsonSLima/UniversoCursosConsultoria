export interface GestorAutorizado {
  id: string;
  email: string;
  perfil: string | null;
  status: string | null;
  context: string | null;
  isGlobal: boolean;
  poloId: string | null;
  poloIds: string[];
  modules: string[];
  financeiroTabs: string[];
  tabs: Record<string, string[]>;
  communicationSector: string;
  communicationPoloId: string | null;
  canViewAllCommunicationPolos: boolean;
  canViewAllCommunication: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const isActiveStatus = (status: unknown) =>
  ["ativo", "active"].includes(normalize(status));

const isFinanceWriteProfile = (perfil: unknown) =>
  ["gestor", "financeiro"].includes(normalize(perfil));

export const authorizationErrorHttpStatus = (message: unknown) => {
  const normalized = normalize(message);
  if (/autenticacao|sessao invalida/.test(normalized)) return 401;
  if (
    /acesso|nao autorizado|apenas usuario interno ativo|fora dos dias ou horarios/
      .test(normalized)
  ) {
    return 403;
  }
  return null;
};

const normalizeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? [
      ...new Set(
        value.map((item) => String(item || "").trim()).filter(Boolean),
      ),
    ]
    : [];

const normalizePermissions = (value: unknown) => {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const rawTabs = source.tabs && typeof source.tabs === "object" &&
      !Array.isArray(source.tabs)
    ? source.tabs as Record<string, unknown>
    : {};
  const tabs: Record<string, string[]> = {};
  for (const [moduleId, moduleTabs] of Object.entries(rawTabs)) {
    tabs[moduleId] = normalizeStringArray(moduleTabs);
  }
  return {
    modules: normalizeStringArray(source.modules),
    financeiroTabs: normalizeStringArray(source.financeiroTabs),
    tabs,
    allPolos: source.allPolos === true,
  };
};

const resolveGestorFinanceiroTabs = (gestor: GestorAutorizado) => {
  const legacyTabs = normalizeStringArray(gestor.financeiroTabs);
  const scopedTabs = normalizeStringArray(gestor.tabs?.financeiro);

  if (!scopedTabs.length) return legacyTabs;
  if (
    scopedTabs.includes("receber") &&
    legacyTabs.includes("receber") &&
    !scopedTabs.includes("conciliacao-bancaria")
  ) {
    return [...new Set([...scopedTabs, "conciliacao-bancaria"])] as string[];
  }

  return scopedTabs;
};

const scheduleAllowsAccess = (value: unknown, now = new Date()) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const schedule = value as Record<string, unknown>;
  if (schedule.ativo !== true) return true;
  const days = normalizeStringArray(schedule.dias).map(Number).filter((day) =>
    Number.isInteger(day) && day >= 0 && day <= 6
  );
  const start = String(schedule.horario_inicio || "");
  const end = String(schedule.horario_fim || "");
  if (
    days.length === 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end
  ) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Maceio",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const formatted = Object.fromEntries(
    parts.map(({ type, value: partValue }) => [type, partValue]),
  );
  const day =
    ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<
      string,
      number
    >)[formatted.weekday];
  const time = `${formatted.hour}:${formatted.minute}`;
  if (start <= end) return days.includes(day) && time >= start && time <= end;
  if (time >= start) return days.includes(day);
  if (time <= end) return days.includes((day + 6) % 7);
  return false;
};

export const bearerTokenFromRequest = (req: Request) =>
  (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();

export const requireGestorAtivo = async (
  req: Request,
  admin: any,
): Promise<GestorAutorizado> => {
  const token = bearerTokenFromRequest(req);
  if (!token) {
    throw new Error("Autenticacao obrigatoria para esta acao financeira.");
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUserId = authData?.user?.id ? String(authData.user.id).trim() : "";
  const email = authData?.user?.email
    ? String(authData.user.email).trim().toLowerCase()
    : "";
  if (authError || !authUserId || !email) {
    throw new Error("Sessao invalida para esta acao financeira.");
  }

  const { data: institutionalAccessAllowed, error: institutionalAccessError } =
    await admin.rpc(
      "portal_identidade_institucional_acesso_liberado",
      { p_auth_user_id: authUserId, p_perfil: "GESTOR" },
    );
  if (institutionalAccessError || institutionalAccessAllowed !== true) {
    throw new Error(
      "Acesso institucional bloqueado ate a criacao da senha.",
    );
  }

  const { data: usuario, error: usuarioError } = await admin
    .from("usuarios_sistema")
    .select(
      "id, email, perfil, status, context, polo_ids, permissoes, perfil_acesso_id, personalizar_permissoes, restricao_horario, setor_comunicacao, polo_comunicacao_id, pode_visualizar_todos_polos, pode_visualizar_todos_setores, perfis_acesso(permissoes, restricao_horario)",
    )
    .ilike("email", email)
    .maybeSingle();
  if (usuarioError) throw usuarioError;
  if (!usuario || !isActiveStatus(usuario.status)) {
    throw new Error(
      "Apenas usuario interno ativo pode executar esta acao financeira.",
    );
  }

  const context = usuario.context ? String(usuario.context).trim() : null;
  const profile = Array.isArray(usuario.perfis_acesso)
    ? usuario.perfis_acesso[0]
    : usuario.perfis_acesso;
  const userPermissions = normalizePermissions(usuario.permissoes);
  const profilePermissions = normalizePermissions(profile?.permissoes);
  const effective = profile && !usuario.personalizar_permissoes
    ? profilePermissions
    : userPermissions;
  const explicitPoloIds = normalizeStringArray(usuario.polo_ids).filter((id) =>
    UUID_RE.test(id)
  );
  const contextPoloId = UUID_RE.test(context || "") ? context : null;
  const poloIds = explicitPoloIds.length > 0
    ? explicitPoloIds
    : contextPoloId
    ? [contextPoloId]
    : [];
  const isGlobal = effective.allPolos && poloIds.length === 0;
  const poloId = isGlobal ? null : poloIds[0] || null;
  const schedule = usuario.restricao_horario ?? profile?.restricao_horario ??
    null;
  if (!scheduleAllowsAccess(schedule)) {
    throw new Error("Acesso bloqueado fora dos dias ou horarios permitidos.");
  }

  return {
    id: usuario.id,
    email,
    perfil: usuario.perfil || null,
    status: usuario.status || null,
    context,
    isGlobal,
    poloId,
    poloIds,
    modules: effective.modules,
    financeiroTabs: effective.financeiroTabs,
    tabs: effective.tabs,
    communicationSector: String(usuario.setor_comunicacao || "todos"),
    communicationPoloId: usuario.polo_comunicacao_id || null,
    canViewAllCommunicationPolos:
      usuario.pode_visualizar_todos_polos === true ||
      usuario.pode_visualizar_todos_setores === true,
    canViewAllCommunication: usuario.pode_visualizar_todos_setores === true,
  };
};

export const requireGestorModule = (
  gestor: GestorAutorizado,
  moduleId: string,
) => {
  if (!gestor.modules.includes(moduleId)) {
    throw new Error(`Acesso ao modulo ${moduleId} nao autorizado.`);
  }
};

export const requireGestorTab = (
  gestor: GestorAutorizado,
  moduleId: string,
  tabId: string,
) => {
  requireGestorModule(gestor, moduleId);
  const allowedTabs = moduleId === "financeiro"
    ? resolveGestorFinanceiroTabs(gestor)
    : gestor.tabs[moduleId];
  if (!allowedTabs?.includes(tabId)) {
    throw new Error(`Acesso a aba ${tabId} nao autorizado.`);
  }
};

export const requireGestorGlobal = (gestor: GestorAutorizado) => {
  if (!gestor.isGlobal || normalize(gestor.perfil) !== "gestor") {
    throw new Error("Apenas gestor global pode alterar configuracoes globais.");
  }
};

export const requireGestorForWhatsAppRoute = (
  gestor: GestorAutorizado,
  sector?: string | null,
  poloId?: string | null,
) => {
  if (gestor.canViewAllCommunication) return;
  if (!poloId) {
    throw new Error(
      "Atendimento WhatsApp sem polo não pode ser operado por usuário restrito.",
    );
  }
  if (!gestor.canViewAllCommunicationPolos) {
    if (!gestor.communicationPoloId) {
      throw new Error(
        "Usuário sem polo de comunicação não pode operar o WhatsApp.",
      );
    }
    if (gestor.communicationPoloId !== poloId) {
      throw new Error(
        "Atendimento WhatsApp pertence a outro polo.",
      );
    }
  }
  const allowedSector = normalize(gestor.communicationSector || "todos");
  const routeSector = normalize(sector || "atendimento_geral");
  if (allowedSector !== "todos" && allowedSector !== routeSector) {
    throw new Error(
      "Atendimento WhatsApp pertence a outro setor.",
    );
  }
};

export const requireFinanceWriteAccess = (gestor: GestorAutorizado) => {
  if (
    !isFinanceWriteProfile(gestor.perfil) ||
    (!gestor.modules.includes("financeiro") &&
      !gestor.modules.includes("caixa"))
  ) {
    throw new Error(
      "Apenas gestor ou financeiro ativo pode executar esta movimentacao financeira.",
    );
  }
};

export const requireGlobalFinancialTabAccess = (
  gestor: GestorAutorizado,
  tabId: string,
) => {
  if (!isFinanceWriteProfile(gestor.perfil)) {
    throw new Error(
      "Acesso financeiro global nao autorizado para este perfil.",
    );
  }
  requireGestorTab(gestor, "financeiro", tabId);
  if (!gestor.isGlobal || gestor.poloIds.length > 0) {
    throw new Error(
      "Acesso financeiro global obrigatorio para esta operacao bancaria.",
    );
  }
};

export const requireGestorForPolo = (
  gestor: GestorAutorizado,
  poloId?: string | null,
) => {
  if (gestor.isGlobal) return;
  if (!poloId) {
    throw new Error(
      "Cobranca sem polo definido nao pode ser movimentada por usuario de polo.",
    );
  }
  if (gestor.poloIds.includes(poloId)) return;
  throw new Error("Gestor sem permissao para movimentar cobranca deste polo.");
};

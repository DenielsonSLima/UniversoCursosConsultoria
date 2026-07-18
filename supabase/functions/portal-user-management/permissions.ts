export const normalizeStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
};

export const normalizePermissionsPayload = (value: unknown) => {
  const permissions =
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};

  const tabsRecord = permissions.tabs && typeof permissions.tabs === "object" &&
      !Array.isArray(permissions.tabs)
    ? permissions.tabs as Record<string, unknown>
    : {};
  const tabs: Record<string, string[]> = {};
  for (const [key, valueTabs] of Object.entries(tabsRecord)) {
    tabs[key] = normalizeStringArray(valueTabs);
  }

  return {
    modules: normalizeStringArray(permissions.modules),
    financeiroTabs: normalizeStringArray(permissions.financeiroTabs),
    allPolos: typeof permissions.allPolos === "boolean"
      ? permissions.allPolos
      : false,
    tabs: Object.keys(tabs).length > 0 ? tabs : undefined,
  };
};

export const isScheduleAllowed = (restriction: any, now = new Date()) => {
  if (!restriction?.ativo) return true;
  const days = Array.isArray(restriction.dias)
    ? restriction.dias.filter((day: unknown) =>
      Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6
    )
    : [];
  const start = String(restriction.horario_inicio || "");
  const end = String(restriction.horario_fim || "");
  if (
    days.length === 0 ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)
  ) {
    return false;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Maceio",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const day = dayMap[values.weekday];
  const time = `${values.hour}:${values.minute}`;
  if (day === undefined) return false;

  if (start <= end) return days.includes(day) && time >= start && time <= end;
  if (time >= start) return days.includes(day);
  if (time <= end) return days.includes((day + 6) % 7);
  return false;
};

export const resolveEffectiveGestor = (gestor: any) => {
  const profile = Array.isArray(gestor?.perfis_acesso)
    ? gestor.perfis_acesso[0]
    : gestor?.perfis_acesso;
  const userPermissions = normalizePermissionsPayload(gestor?.permissoes);
  const permissions = profile && !gestor?.personalizar_permissoes
    ? normalizePermissionsPayload(profile.permissoes)
    : userPermissions;

  return {
    ...gestor,
    permissoes: { ...permissions, allPolos: userPermissions.allPolos },
    restricao_horario: gestor?.restricao_horario ??
      profile?.restricao_horario ?? null,
  };
};

export const isActiveGestor = (status?: string | null) => {
  const current = String(status || "").trim().toUpperCase();
  return current === "ATIVO" || current === "ACTIVE";
};

export const isUuid = (value?: string | null) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim(),
  );

export const gestorHasModule = (gestor: any, moduleId: string) => {
  const rawPermissions = gestor?.permissoes;
  if (!rawPermissions) return false;
  if (Array.isArray(rawPermissions)) {
    return normalizeStringArray(rawPermissions).includes(moduleId);
  }
  if (typeof rawPermissions !== "object") return false;

  const hasExplicitPermissions = [
    "modules",
    "financeiroTabs",
    "allPolos",
    "tabs",
  ]
    .some((key) => key in rawPermissions);
  if (!hasExplicitPermissions) return false;

  const permissions = normalizePermissionsPayload(rawPermissions);
  return permissions.modules.includes(moduleId);
};

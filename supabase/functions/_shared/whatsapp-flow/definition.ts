export type FlowBuilderAction =
  | "goto"
  | "route"
  | "finance_link"
  | "finance_pix"
  | "finance_irpf"
  | "course_agent"
  | "redirect"
  | "handoff"
  | "reply";

export type FlowBuilderPoloMode = "inherit" | "default" | "label" | "none";

export type FlowBuilderOption = {
  id: string;
  label: string;
  enabled: boolean;
  action: FlowBuilderAction;
  targetNodeId?: string | null;
  sector?: string | null;
  poloMode?: FlowBuilderPoloMode;
  poloLabel?: string | null;
  institution?: "universo" | "anhanguera" | "unopar" | null;
  subject?: string | null;
  responseMessage?: string | null;
  rememberKey?: string | null;
  rememberValue?: string | null;
  setInstitution?: "universo" | "anhanguera" | "unopar" | null;
};

export type FlowBuilderNode = {
  id: string;
  name: string;
  message: string;
  enabled: boolean;
  options: FlowBuilderOption[];
};

export type FlowBuilderDefinition = {
  version: 1;
  startNodeId: string;
  nodes: FlowBuilderNode[];
};

const ACTIONS = new Set<FlowBuilderAction>([
  "goto",
  "route",
  "finance_link",
  "finance_pix",
  "finance_irpf",
  "course_agent",
  "redirect",
  "handoff",
  "reply",
]);

const SECTORS = new Set([
  "pedagogico_coordenacao",
  "financeiro",
  "comercial_matriculas",
  "secretaria",
  "atendimento_geral",
]);

const POLO_MODES = new Set<FlowBuilderPoloMode>([
  "inherit",
  "default",
  "label",
  "none",
]);

const INSTITUTIONS = new Set(["universo", "anhanguera", "unopar"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value: unknown, max: number) =>
  String(value || "").trim().slice(0, max);

const optionalText = (value: unknown, max: number) => {
  const result = cleanText(value, max);
  return result || null;
};

export const parseFlowBuilder = (
  value: unknown,
): FlowBuilderDefinition | null => {
  if (!isObject(value) || !Array.isArray(value.nodes)) return null;

  const nodes: FlowBuilderNode[] = [];
  const nodeIds = new Set<string>();

  for (const rawNode of value.nodes.slice(0, 30)) {
    if (!isObject(rawNode)) continue;
    const id = cleanText(rawNode.id, 80);
    const name = cleanText(rawNode.name, 120);
    const message = cleanText(rawNode.message, 4000);
    if (!id || !name || !message || nodeIds.has(id)) continue;
    nodeIds.add(id);

    const optionIds = new Set<string>();
    const options: FlowBuilderOption[] = [];
    const rawOptions = Array.isArray(rawNode.options) ? rawNode.options : [];
    for (const rawOption of rawOptions.slice(0, 12)) {
      if (!isObject(rawOption)) continue;
      const optionId = cleanText(rawOption.id, 80);
      const label = cleanText(rawOption.label, 160);
      const action = cleanText(rawOption.action, 40) as FlowBuilderAction;
      if (
        !optionId ||
        !label ||
        optionIds.has(optionId) ||
        !ACTIONS.has(action)
      ) continue;
      optionIds.add(optionId);

      const sector = cleanText(rawOption.sector, 60);
      const poloMode = cleanText(rawOption.poloMode, 20) as FlowBuilderPoloMode;
      const institution = cleanText(rawOption.institution, 30);
      const setInstitution = cleanText(rawOption.setInstitution, 30);
      options.push({
        id: optionId,
        label,
        action,
        enabled: rawOption.enabled !== false,
        targetNodeId: optionalText(rawOption.targetNodeId, 80),
        sector: SECTORS.has(sector) ? sector : null,
        poloMode: POLO_MODES.has(poloMode) ? poloMode : "inherit",
        poloLabel: optionalText(rawOption.poloLabel, 120),
        institution: INSTITUTIONS.has(institution)
          ? institution as FlowBuilderOption["institution"]
          : null,
        subject: optionalText(rawOption.subject, 180),
        responseMessage: optionalText(rawOption.responseMessage, 4000),
        rememberKey: optionalText(rawOption.rememberKey, 60),
        rememberValue: optionalText(rawOption.rememberValue, 180),
        setInstitution: INSTITUTIONS.has(setInstitution)
          ? setInstitution as FlowBuilderOption["setInstitution"]
          : null,
      });
    }

    nodes.push({
      id,
      name,
      message,
      enabled: rawNode.enabled !== false,
      options,
    });
  }

  if (nodes.length === 0) return null;
  const startNodeId = cleanText(value.startNodeId, 80);
  if (!nodeIds.has(startNodeId)) return null;

  for (const node of nodes) {
    for (const option of node.options) {
      if (
        option.action === "goto" &&
        (!option.targetNodeId || !nodeIds.has(option.targetNodeId))
      ) return null;
      if (
        option.action === "redirect" &&
        !["anhanguera", "unopar"].includes(String(option.institution || ""))
      ) return null;
    }
  }

  return { version: 1, startNodeId, nodes };
};

export const activeFlowOptions = (node: FlowBuilderNode) =>
  node.options.filter((option) => option.enabled);

export const renderFlowBuilderNode = (node: FlowBuilderNode) => {
  const options = activeFlowOptions(node);
  const menu = options
    .map((option, index) => `${index + 1}️⃣ ${option.label}`)
    .join("\n");
  return [node.message, menu].filter(Boolean).join("\n\n").slice(0, 4096);
};

export const findFlowBuilderOption = (
  node: FlowBuilderNode,
  menuNumber: number | null,
) => {
  if (!menuNumber) return null;
  return activeFlowOptions(node)[menuNumber - 1] || null;
};

export const renderFlowBuilderTemplate = (
  value: unknown,
  data: Record<string, unknown>,
) =>
  String(value || "").replace(
    /{{\s*([a-zA-Z0-9_]{1,60})\s*}}/g,
    (_match, key: string) => String(data[key] || ""),
  ).trim();

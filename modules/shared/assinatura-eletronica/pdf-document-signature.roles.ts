const STAMP_ROLE_LABELS: Record<string, string> = {
  PROFESSOR: "Professor",
  COORDENADOR: "Coordenador de curso",
};

const STAMP_ROLE_CHIPS: Record<string, string> = {
  PROFESSOR: "PROFESSOR",
  COORDENADOR: "COORDENADOR",
};

export const stampRoleLabel = (role: string) => STAMP_ROLE_LABELS[role] || role;
export const stampRoleChip = (role: string) => STAMP_ROLE_CHIPS[role] || role;

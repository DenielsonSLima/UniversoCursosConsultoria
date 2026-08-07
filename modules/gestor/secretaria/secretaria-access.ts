export const SECRETARIA_ACCESS_OPTIONS = [
  { id: 'alunos', label: 'Busca de Aluno 360º', legacyTab: null },
  { id: 'declaracao-matricula', label: 'Declaração de Matrícula', legacyTab: 'declaracoes' },
  { id: 'declaracao-frequencia', label: 'Declaração de Frequência', legacyTab: 'declaracoes' },
  { id: 'boletim', label: 'Boletim Escolar', legacyTab: 'declaracoes' },
  { id: 'atestado-conclusao', label: 'Atestado de Conclusão', legacyTab: 'declaracoes' },
  { id: 'declaracao-irpf', label: 'Declaração de IRPF', legacyTab: 'declaracoes' },
  { id: 'contrato-aluno', label: 'Contratos de Aluno', legacyTab: 'declaracoes' },
  { id: 'historico-escolar', label: 'Histórico Escolar', legacyTab: 'historico' },
  { id: 'pasta-identificacao', label: 'Pasta de Identificação', legacyTab: 'fichas' },
  { id: 'ficha-matricula', label: 'Ficha de Matrícula', legacyTab: 'fichas' },
  { id: 'carteirinha', label: 'Carteirinha Estudantil', legacyTab: 'carteirinhas' },
  { id: 'carteirinha-preceptor', label: 'Carteirinha de Preceptor', legacyTab: 'carteirinhas' },
  { id: 'cracha-estagio', label: 'Crachá de Estágio', legacyTab: 'carteirinhas' },
  { id: 'cracha-periodo-eleitoral', label: 'Crachá SES', legacyTab: 'carteirinhas' },
  { id: 'termo-estagio', label: 'Termo de Estágio', legacyTab: 'solicitacoes' },
  { id: 'consulta-financeira', label: 'Financeiro / Recebimentos', legacyTab: 'recebimentos' },
  { id: 'transferencia', label: 'Transferência', legacyTab: 'solicitacoes' },
  { id: 'solicitacoes', label: 'Solicitações Acadêmicas', legacyTab: 'solicitacoes' },
  { id: 'dependencias-academicas', label: 'Dependências Acadêmicas', legacyTab: 'solicitacoes' },
  { id: 'certificados', label: 'Certificados', legacyTab: 'historico' },
  { id: 'historico-emissoes', label: 'Histórico de Emissões', legacyTab: 'historico' },
] as const;

export type SecretariaAccessId = typeof SECRETARIA_ACCESS_OPTIONS[number]['id'];

const secretariaLegacyTabs = new Set<string>(
  SECRETARIA_ACCESS_OPTIONS.flatMap(option => option.legacyTab ? [option.legacyTab] : []),
);

const secretariaAccessIds = new Set<string>(
  SECRETARIA_ACCESS_OPTIONS.map(option => option.id),
);

export const normalizeSecretariaAccessTabs = (tabs: unknown): string[] => {
  if (!Array.isArray(tabs)) return [];

  const normalized = tabs
    .map(tab => typeof tab === 'string' ? tab.trim() : '')
    .filter(Boolean);
  const hasLegacyTabs = normalized.some(tab => secretariaLegacyTabs.has(tab));
  const allowed = new Set(
    normalized.filter(tab => secretariaAccessIds.has(tab)),
  );

  if (hasLegacyTabs) {
    for (const option of SECRETARIA_ACCESS_OPTIONS) {
      if (option.legacyTab === null || normalized.includes(option.legacyTab)) {
        allowed.add(option.id);
      }
    }
  }

  return [...allowed];
};

export const canAccessSecretariaOperation = (
  tabs: Record<string, string[]> | undefined,
  operationId: string,
): boolean => normalizeSecretariaAccessTabs(tabs?.secretaria).includes(operationId);

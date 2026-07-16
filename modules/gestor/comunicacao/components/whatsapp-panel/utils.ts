import { ContasReceber } from '../../../financeiro/financeiro.service';

export type OverdueTurmaGroup = {
  id: string;
  label: string;
  items: ContasReceber[];
  count: number;
  total: number;
};

export type OverdueCourseGroup = {
  id: string;
  label: string;
  count: number;
  total: number;
  turmas: OverdueTurmaGroup[];
};

export type OverdueModalityGroup = {
  id: string;
  label: string;
  count: number;
  total: number;
  courses: OverdueCourseGroup[];
};

export const formatMoney = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

export const formatDate = (value?: string) => {
  if (!value) return '-';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

export const formatCpfFinal = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 11 ? digits.slice(-4) : 'não informado';
};

export const isOverdue = (status: string, dueDate: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDate}T00:00:00`);
  return status === 'VENCIDO' || (status === 'PENDENTE' && due < today);
};

export const receivableId = (item: ContasReceber) =>
  item.id || `${item.clienteId || 'cliente'}-${item.dataVencimento}-${item.descricao}`;

export const courseTypeLabel = (value?: string) => {
  const normalized = String(value || '').toUpperCase();
  const labels: Record<string, string> = {
    EAD: 'EAD',
    TECNICO: 'Técnico',
    TECNICOS: 'Técnico',
    LIVRE: 'Livres',
    LIVRES: 'Livres',
    ESPECIALIZACAO: 'Especialização',
    ESPECIALIZAÇÃO: 'Especialização',
    SUPERIOR: 'Superior',
  };
  return labels[normalized] || 'Sem modalidade';
};

export const firstPaymentLink = (items: ContasReceber[]) =>
  items.find((item) => item.asaasInvoiceUrl)?.asaasInvoiceUrl ||
  items.find((item) => item.asaasBankSlipUrl)?.asaasBankSlipUrl ||
  '';

export const applyTemplate = (template: string, values: Record<string, string>) =>
  Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{{${key}}}`, value),
    template,
  );

export const contactTone = (type?: string) => {
  if (type === 'Aluno') return { label: 'Aluno', avatar: 'bg-blue-600', badge: 'bg-blue-50 text-blue-700 border-blue-100' };
  if (type === 'Professor') return { label: 'Professor', avatar: 'bg-purple-600', badge: 'bg-purple-50 text-purple-700 border-purple-100' };
  if (type === 'PJ') return { label: 'Pessoa Jurídica', avatar: 'bg-emerald-600', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
  return { label: 'Pessoa Física', avatar: 'bg-slate-700', badge: 'bg-slate-50 text-slate-700 border-slate-100' };
};

export const groupOverdueReceivables = (items: ContasReceber[]): OverdueModalityGroup[] => {
  const modalities = new Map<string, Map<string, Map<string, ContasReceber[]>>>();

  items.forEach((item) => {
    const modalityLabel = courseTypeLabel(item.cursoModalidade);
    const courseLabel = item.cursoNome || 'Curso não informado';
    const turmaLabel = item.turmaNome || 'Turma não informada';

    if (!modalities.has(modalityLabel)) modalities.set(modalityLabel, new Map());
    const courseMap = modalities.get(modalityLabel)!;
    if (!courseMap.has(courseLabel)) courseMap.set(courseLabel, new Map());
    const turmaMap = courseMap.get(courseLabel)!;
    if (!turmaMap.has(turmaLabel)) turmaMap.set(turmaLabel, []);
    turmaMap.get(turmaLabel)!.push(item);
  });

  return [...modalities.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([modalityLabel, courseMap]) => {
      const courses = [...courseMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
        .map(([courseLabel, turmaMap]) => {
          const turmas = [...turmaMap.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
            .map(([turmaLabel, turmaItems]) => {
              const sorted = [...turmaItems].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
              return {
                id: `${modalityLabel}::${courseLabel}::${turmaLabel}`,
                label: turmaLabel,
                items: sorted,
                count: sorted.length,
                total: sorted.reduce((sum, item) => sum + Number(item.valor || 0), 0),
              };
            });

          return {
            id: `${modalityLabel}::${courseLabel}`,
            label: courseLabel,
            count: turmas.reduce((sum, group) => sum + group.count, 0),
            total: turmas.reduce((sum, group) => sum + group.total, 0),
            turmas,
          };
        });

      return {
        id: modalityLabel,
        label: modalityLabel,
        count: courses.reduce((sum, group) => sum + group.count, 0),
        total: courses.reduce((sum, group) => sum + group.total, 0),
        courses,
      };
    });
};

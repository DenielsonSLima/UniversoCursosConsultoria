export type CaixaReportKind = 'COMPLETO' | 'RESUMIDO';

export const formatCaixaReportModality = (value: string) => value === 'SERVICOS_NFSE' ? 'Serviços NFS-e' : value;

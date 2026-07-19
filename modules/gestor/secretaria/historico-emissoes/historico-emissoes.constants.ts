import {
  ArrowRightLeft,
  Award,
  BadgeCheck,
  BriefcaseBusiness,
  ClipboardCheck,
  CreditCard,
  FileBadge,
  FileCheck2,
  History,
  Landmark,
  RefreshCcw,
  ScrollText,
} from 'lucide-react';
import type { CertificadoModalidade } from '../certificados/certificados.types';

export const PAGE_SIZE = 10;

export const DOCUMENT_TABS = [
  { key: 'todos', label: 'Todos', icon: History },
  { key: 'carteirinha', label: 'Carteirinha', icon: CreditCard },
  { key: 'cracha_estagio', label: 'Crachá de Estágio', icon: FileCheck2 },
  { key: 'declaracao_matricula', label: 'Declaração Matrícula', icon: FileBadge },
  { key: 'declaracao_frequencia', label: 'Declaração Frequência', icon: BadgeCheck },
  { key: 'declaracao_irpf', label: 'Declaração IRPF', icon: Landmark },
  { key: 'boletim', label: 'Boletim Escolar', icon: ClipboardCheck },
  { key: 'atestado_conclusao_tecnico', label: 'Atestado de Conclusão', icon: BadgeCheck },
  { key: 'historico_escolar', label: 'Histórico Escolar', icon: ScrollText },
  { key: 'rematricula', label: 'Rematrícula', icon: RefreshCcw },
  { key: 'termo_estagio', label: 'Termo de Estágio', icon: BriefcaseBusiness },
  { key: 'transferencia', label: 'Transferência', icon: ArrowRightLeft },
  { key: 'certificado_tecnico', label: 'Certificado Técnico', icon: Award },
  { key: 'certificado_livre', label: 'Certificado Livre', icon: Award },
  { key: 'certificado_ead', label: 'Certificado EAD', icon: Award },
  { key: 'certificado_especializacao', label: 'Certificado Especialização', icon: Award },
] as const;

export const CERTIFICATE_DOCUMENT_MODALITY: Record<string, CertificadoModalidade> = {
  certificado_tecnico: 'TECNICO',
  certificado_livre: 'LIVRE',
  certificado_ead: 'EAD',
  certificado_especializacao: 'ESPECIALIZACAO',
};

export const isCertificateDocument = (documento: string) =>
  documento in CERTIFICATE_DOCUMENT_MODALITY;

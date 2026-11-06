import React from 'react';
import {
  ArrowRightLeft,
  BadgeCheck,
  BriefcaseBusiness,

  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  CircleDollarSign,
  FileBadge,
  FileCheck2,
  Landmark,
  ScrollText,
  Search,
  History,
  Award,
  Vote,
  FolderKanban,
  FileSignature,
  FileStack,
  BookOpenCheck,
} from 'lucide-react';

interface SecretariaDashboardProps {
  onNavigate: (module: string) => void;
  onPreload?: (module: string) => void;
  allowedTabs?: string[];
}

const cards = [
  { id: 'alunos', title: 'Busca de Aluno 360º', desc: 'Dados acadêmicos, cadastrais e financeiros.', icon: Search, color: 'blue' },
  { id: 'declaracao-matricula', title: 'Declaração de Matrícula', desc: 'Comprovação individual ou por turma.', icon: FileBadge, color: 'emerald' },
  { id: 'declaracao-frequencia', title: 'Declaração de Frequência', desc: 'Frequência consolidada pelo serviço acadêmico.', icon: BadgeCheck, color: 'sky' },
  { id: 'boletim', title: 'Boletim Escolar', desc: 'Notas e resultados dos cursos técnicos.', icon: ClipboardCheck, color: 'indigo' },
  { id: 'atestado-conclusao', title: 'Atestado de Conclusão', desc: 'Comprovação provisória para cursos técnicos concluídos.', icon: BadgeCheck, color: 'emerald' },
  { id: 'declaracao-irpf', title: 'Declaração de IRPF', desc: 'Comprovante financeiro do ano-calendário.', icon: Landmark, color: 'amber' },
  { id: 'contrato-aluno', title: 'Contratos de Aluno', desc: 'Emissão individual, em lote ou personalizada com QR Code.', icon: FileSignature, color: 'blue' },
  { id: 'historico-escolar', title: 'Histórico Escolar', desc: 'Percurso curricular e resultados acadêmicos.', icon: ScrollText, color: 'slate' },
  { id: 'pasta-identificacao', title: 'Pasta de Identificação', desc: 'Capa A4 da pasta do aluno, individual, em lote ou personalizada.', icon: FolderKanban, color: 'cyan' },
  { id: 'ficha-matricula', title: 'Ficha de Matrícula', desc: 'Ficha completa com foto, dados acadêmicos, termo e assinaturas.', icon: FileSignature, color: 'blue' },
  { id: 'carteirinha', title: 'Carteirinha Estudantil', desc: 'Identificação estudantil com QR Code.', icon: CreditCard, color: 'purple' },
  { id: 'carteirinha-preceptor', title: 'Crachá de Preceptor', desc: 'Identificação profissional para professores ativos do polo.', icon: BadgeCheck, color: 'violet' },
  { id: 'cracha-estagio', title: 'Crachá de Estágio', desc: 'Identificação para atividades supervisionadas.', icon: FileCheck2, color: 'rose' },
  { id: 'cracha-periodo-eleitoral', title: 'SES', desc: 'Crachá do aluno liberado após a entrada no estágio.', icon: Vote, color: 'cyan' },
  { id: 'termo-estagio', title: 'Termo de Estágio', desc: 'Termo de compromisso individual ou em lote.', icon: BriefcaseBusiness, color: 'teal' },
  { id: 'consulta-financeira', title: 'Recebimentos', desc: 'Baixas por aluno e curso: individual, lote ou personalizado.', icon: CircleDollarSign, color: 'cyan' },
  { id: 'carnes-alunos', title: 'Carnês dos Alunos', desc: 'Documentos Banese existentes: individual, em lote ou personalizado.', icon: FileStack, color: 'emerald' },
  { id: 'transferencia', title: 'Transferência', desc: 'Transferência externa e emissão de guia.', icon: ArrowRightLeft, color: 'orange' },
  { id: 'solicitacoes', title: 'Solicitações Acadêmicas', desc: 'Análise e homologação de requerimentos.', icon: ClipboardList, color: 'red' },
  { id: 'dependencias-academicas', title: 'Dependências Acadêmicas', desc: 'Reoferta por disciplina, cobrança Banese e diário de destino.', icon: BookOpenCheck, color: 'cyan' },
  { id: 'certificados', title: 'Certificados', desc: 'Fila de concluintes, registros, SISTEC e emissão por modalidade.', icon: Award, color: 'emerald' },
  { id: 'historico-emissoes', title: 'Histórico de Emissões', desc: 'Controle, filtros e 2ª via de todos os documentos emitidos.', icon: History, color: 'blue' },
  { id: 'assinatura-eletronica', title: 'Assinaturas', desc: 'Acompanhe pendências e consulte o acervo de documentos assinados.', icon: FileSignature, color: 'blue' },
] as const;

const sections = [
  {
    id: 'atendimento',
    title: 'Atendimento e financeiro',
    description: 'Consultas, solicitações e recebimentos',
    accent: 'bg-blue-600',
    badge: 'bg-blue-50 text-blue-700',
    operations: ['alunos', 'solicitacoes', 'transferencia', 'dependencias-academicas', 'consulta-financeira', 'carnes-alunos', 'declaracao-irpf'],
  },
  {
    id: 'documentos',
    title: 'Documentos acadêmicos',
    description: 'Declarações e registros da vida escolar',
    accent: 'bg-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700',
    operations: ['declaracao-matricula', 'declaracao-frequencia', 'ficha-matricula', 'boletim', 'historico-escolar', 'atestado-conclusao', 'contrato-aluno', 'certificados'],
  },
  {
    id: 'identificacao',
    title: 'Identificação e acervo',
    description: 'Credenciais, estágio e documentos emitidos',
    accent: 'bg-cyan-700',
    badge: 'bg-cyan-50 text-cyan-800',
    operations: ['carteirinha', 'pasta-identificacao', 'carteirinha-preceptor', 'cracha-estagio', 'cracha-periodo-eleitoral', 'termo-estagio', 'historico-emissoes', 'assinatura-eletronica'],
  },
];

const SecretariaDashboard: React.FC<SecretariaDashboardProps> = ({ onNavigate, onPreload, allowedTabs }) => {
  const visibleCards = React.useMemo(() => {
    if (!allowedTabs) return cards;
    return cards.filter(card => allowedTabs.includes(card.id));
  }, [allowedTabs]);

  return (
    <nav aria-label="Operações da Secretaria" className="secretaria-navigation grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
      {sections.map(section => {
        const sectionCards = section.operations.flatMap(id => visibleCards.filter(card => card.id === id));
        if (!sectionCards.length) return null;

        return (
          <section
            key={section.id}
            aria-labelledby={`secretaria-section-${section.id}`}
            className="min-w-0 overflow-hidden rounded-xl border border-[#e3e9ee] bg-white"
          >
            <div className="flex items-start gap-3 border-b border-[#e3e9ee] bg-[#f9fbfc] px-4 py-4">
              <span aria-hidden="true" className={`mt-1 h-7 w-0.5 shrink-0 rounded-full ${section.accent}`} />
              <div className="min-w-0 flex-1">
                <h3 id={`secretaria-section-${section.id}`} className="text-[13px] font-semibold leading-5 text-[#122b42]">{section.title}</h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[#607286]">{section.description}</p>
              </div>
              <span aria-label={`${sectionCards.length} operações`} className={`rounded-md px-2 py-0.5 text-[11px] font-medium tabular-nums ${section.badge}`}>
                {String(sectionCards.length).padStart(2, '0')}
              </span>
            </div>
            <div className="divide-y divide-[#edf1f5]">
              {sectionCards.map(card => {
                const Icon = card.icon;
                const featured = card.id === 'alunos';
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => onNavigate(card.id)}
                    onMouseEnter={() => onPreload?.(card.id)}
                    onFocus={() => onPreload?.(card.id)}
                    onTouchStart={() => onPreload?.(card.id)}
                    className={`group relative flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 motion-reduce:transition-none ${featured ? 'bg-[#0c2942] hover:bg-[#143851]' : 'bg-white hover:bg-[#f5f8fc]'}`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${featured ? 'bg-white/10 text-blue-200' : 'bg-[#f3f6f9] text-[#607286] group-hover:bg-blue-50 group-hover:text-blue-600'}`}>
                      <Icon size={17} strokeWidth={1.65} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className={`text-[13px] font-medium leading-[1.5] tracking-[-0.01em] ${featured ? 'text-white' : 'text-[#122b42]'}`}>{card.title}</h4>
                      <p className={`mt-1 text-[11px] font-normal leading-[1.6] ${featured ? 'text-[#b7c9da]' : 'text-[#607286]'}`}>{card.desc}</p>
                    </div>
                    <ChevronRight size={14} aria-hidden="true" className={`shrink-0 ${featured ? 'text-blue-200' : 'text-slate-300 group-hover:text-blue-600 group-focus-visible:text-blue-600'}`} />
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </nav>
  );
};

export default SecretariaDashboard;

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
  RefreshCcw,
  ScrollText,
  Search,
  History,
  Award,
} from 'lucide-react';

interface SecretariaDashboardProps {
  onNavigate: (module: string) => void;
}

const cards = [
  { id: 'alunos', title: 'Busca de Aluno 360º', desc: 'Dados acadêmicos, cadastrais e financeiros.', icon: Search, color: 'blue' },
  { id: 'declaracao-matricula', title: 'Declaração de Matrícula', desc: 'Comprovação individual ou por turma.', icon: FileBadge, color: 'emerald' },
  { id: 'declaracao-frequencia', title: 'Declaração de Frequência', desc: 'Frequência consolidada pelo serviço acadêmico.', icon: BadgeCheck, color: 'sky' },
  { id: 'boletim', title: 'Boletim Escolar', desc: 'Notas e resultados dos cursos técnicos.', icon: ClipboardCheck, color: 'indigo' },
  { id: 'atestado-conclusao', title: 'Atestado de Conclusão', desc: 'Comprovação provisória para cursos técnicos concluídos.', icon: BadgeCheck, color: 'emerald' },
  { id: 'declaracao-irpf', title: 'Declaração de IRPF', desc: 'Comprovante financeiro do ano-calendário.', icon: Landmark, color: 'amber' },
  { id: 'historico-escolar', title: 'Histórico Escolar', desc: 'Percurso curricular e resultados acadêmicos.', icon: ScrollText, color: 'slate' },
  { id: 'carteirinha', title: 'Carteirinha Estudantil', desc: 'Identificação estudantil com QR Code.', icon: CreditCard, color: 'purple' },
  { id: 'cracha-estagio', title: 'Crachá de Estágio', desc: 'Identificação para atividades supervisionadas.', icon: FileCheck2, color: 'rose' },
  { id: 'termo-estagio', title: 'Termo de Estágio', desc: 'Termo de compromisso individual ou em lote.', icon: BriefcaseBusiness, color: 'teal' },
  { id: 'rematricula', title: 'Rematrícula', desc: 'Preparação do processo por aluno ou turma.', icon: RefreshCcw, color: 'violet' },
  { id: 'consulta-financeira', title: 'Financeiro do Aluno', desc: 'Consulta inicial de contratos, parcelas e movimentações.', icon: CircleDollarSign, color: 'cyan' },
  { id: 'transferencia', title: 'Transferência', desc: 'Transferência externa e emissão de guia.', icon: ArrowRightLeft, color: 'orange' },
  { id: 'solicitacoes', title: 'Solicitações Acadêmicas', desc: 'Análise e homologação de requerimentos.', icon: ClipboardList, color: 'red' },
  { id: 'certificados', title: 'Certificados', desc: 'Fila de concluintes, registros, SISTEC e emissão por modalidade.', icon: Award, color: 'emerald' },
  { id: 'historico-emissoes', title: 'Histórico de Emissões', desc: 'Controle, filtros e 2ª via de todos os documentos emitidos.', icon: History, color: 'blue' },
] as const;


const colorClasses: Record<string, { soft: string; text: string; hover: string; accent: string }> = {
  blue: { soft: 'bg-blue-50', text: 'text-blue-600', hover: 'hover:border-blue-300', accent: 'bg-blue-600' },
  emerald: { soft: 'bg-emerald-50', text: 'text-emerald-600', hover: 'hover:border-emerald-300', accent: 'bg-emerald-600' },
  sky: { soft: 'bg-sky-50', text: 'text-sky-600', hover: 'hover:border-sky-300', accent: 'bg-sky-600' },
  indigo: { soft: 'bg-indigo-50', text: 'text-indigo-600', hover: 'hover:border-indigo-300', accent: 'bg-indigo-600' },
  amber: { soft: 'bg-amber-50', text: 'text-amber-600', hover: 'hover:border-amber-300', accent: 'bg-amber-500' },
  slate: { soft: 'bg-slate-100', text: 'text-slate-700', hover: 'hover:border-slate-400', accent: 'bg-slate-700' },
  purple: { soft: 'bg-purple-50', text: 'text-purple-600', hover: 'hover:border-purple-300', accent: 'bg-purple-600' },
  rose: { soft: 'bg-rose-50', text: 'text-rose-600', hover: 'hover:border-rose-300', accent: 'bg-rose-600' },
  teal: { soft: 'bg-teal-50', text: 'text-teal-600', hover: 'hover:border-teal-300', accent: 'bg-teal-600' },
  violet: { soft: 'bg-violet-50', text: 'text-violet-600', hover: 'hover:border-violet-300', accent: 'bg-violet-600' },
  orange: { soft: 'bg-orange-50', text: 'text-orange-600', hover: 'hover:border-orange-300', accent: 'bg-orange-500' },
  red: { soft: 'bg-red-50', text: 'text-red-600', hover: 'hover:border-red-300', accent: 'bg-red-500' },
  cyan: { soft: 'bg-cyan-50', text: 'text-cyan-700', hover: 'hover:border-cyan-300', accent: 'bg-cyan-600' },
};

const SecretariaDashboard: React.FC<SecretariaDashboardProps> = ({ onNavigate }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 animate-fadeIn">
    {cards.map((card) => {
      const Icon = card.icon;
      const palette = colorClasses[card.color];
      return (
        <button
          key={card.id}
          onClick={() => onNavigate(card.id)}
          className={`group relative flex items-start gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm text-left transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${palette.hover}`}
        >
          <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${palette.soft} ${palette.text} group-hover:scale-105 transition-transform`}>
            <Icon size={22} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h4 className="font-black text-[#001a33] text-sm uppercase tracking-tight">{card.title}</h4>
            <p className="text-slate-500 text-xs leading-relaxed font-medium mt-1">{card.desc}</p>
          </div>
          <ChevronRight size={16} className={`self-center opacity-0 group-hover:opacity-100 ${palette.text} transition-opacity`} />
          <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${palette.accent} opacity-0 group-hover:opacity-100 transition-opacity`} />
        </button>
      );
    })}
  </div>
);

export default SecretariaDashboard;

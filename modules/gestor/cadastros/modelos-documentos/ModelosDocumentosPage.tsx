
import React, { useState } from 'react';
import { 
  CreditCard, 
  FileText, 
  ArrowRightLeft, 
  Calendar, 
  ScrollText, 
  Briefcase, 
  Award,
  Download,
  ArrowLeft,
  Contact,
  ClipboardCheck,
  BadgeCheck
} from 'lucide-react';

// Importação dos Componentes Internos
import CarteirinhaPage from './carteirinha/CarteirinhaPage';
import CrachaPage from './cracha/CrachaPage';
import DeclaracaoPage from './declaracao/DeclaracaoPage';
import TransferenciaPage from './transferencia/TransferenciaPage';
import DiariosPage from './diarios/DiariosPage';
import HistoricoPage from './historico/HistoricoPage';
import EstagioPage from './estagio/EstagioPage';
import DiplomaPage from './diploma/DiplomaPage';
import IRPFPage from './irpf/IRPFPage';
import BoletimPage from './boletim/BoletimPage';
import DeclaracaoFrequenciaPage from './declaracao-frequencia/DeclaracaoFrequenciaPage';
import AtestadoConclusaoPage from './atestado-conclusao/AtestadoConclusaoPage';
import ReciboDespesaPage from './recibo/ReciboDespesaPage';

const ModelosDocumentosPage: React.FC = () => {
  const [activeModule, setActiveModule] = useState<string | null>(null);

  const models = [
    { id: 'carteirinha', title: 'Carteirinha de Estudante', desc: 'Identificação oficial com foto e QR Code.', icon: <CreditCard size={24} />, color: 'bg-blue-600' },
    { id: 'cracha', title: 'Crachá de Identificação', desc: 'Crachá vertical para colaboradores, técnicos e professores.', icon: <Contact size={24} />, color: 'bg-rose-600' },
    { id: 'declaracao', title: 'Declaração Cursando', desc: 'Comprovante de matrícula ativa e regular.', icon: <FileText size={24} />, color: 'bg-emerald-600' },
    { id: 'declaracao-frequencia', title: 'Declaração de Frequência', desc: 'Comprovante de frequência acadêmica regular.', icon: <BadgeCheck size={24} />, color: 'bg-sky-600' },
    { id: 'transferencia', title: 'Modelo de Transferência', desc: 'Documentação para trâmite externo.', icon: <ArrowRightLeft size={24} />, color: 'bg-orange-500' },
    { id: 'diarios', title: 'Modelos Diários', desc: 'Pautas de frequência e conteúdo programático.', icon: <Calendar size={24} />, color: 'bg-indigo-600' },
    { id: 'historico', title: 'Modelo Histórico Escolar', desc: 'Registro acadêmico de notas e faltas.', icon: <ScrollText size={24} />, color: 'bg-slate-700' },
    { id: 'boletim', title: 'Modelo Boletim Escolar', desc: 'Notas e frequência dos cursos técnicos.', icon: <ClipboardCheck size={24} />, color: 'bg-cyan-600' },
    { id: 'atestado-conclusao', title: 'Atestado de Conclusão', desc: 'Comprovação provisória para cursos técnicos concluídos.', icon: <BadgeCheck size={24} />, color: 'bg-emerald-600' },
    { id: 'estagio', title: 'Termo de Estágio', desc: 'Contrato e plano de atividades do estagiário.', icon: <Briefcase size={24} />, color: 'bg-teal-600' },
    { id: 'diploma', title: 'Modelo Diploma', desc: 'Certificado de conclusão de curso.', icon: <Award size={24} />, color: 'bg-purple-600' },
    { id: 'irpf', title: 'Declaração de IRPF', desc: 'Modelo de declaração financeira para fins de Imposto de Renda.', icon: <FileText size={24} />, color: 'bg-emerald-700' },
    { id: 'recibo', title: 'Modelo Recibo', desc: 'Recibo de pagamento de despesas fixas, variáveis e outros débitos.', icon: <FileText size={24} />, color: 'bg-rose-600' },
  ];

  const renderContent = () => {
    switch (activeModule) {
      case 'carteirinha': return <CarteirinhaPage />;
      case 'cracha': return <CrachaPage />;
      case 'declaracao': return <DeclaracaoPage />;
      case 'declaracao-frequencia': return <DeclaracaoFrequenciaPage />;
      case 'transferencia': return <TransferenciaPage />;
      case 'diarios': return <DiariosPage />;
      case 'historico': return <HistoricoPage />;
      case 'boletim': return <BoletimPage />;
      case 'atestado-conclusao': return <AtestadoConclusaoPage />;
      case 'estagio': return <EstagioPage />;
      case 'diploma': return <DiplomaPage />;
      case 'irpf': return <IRPFPage />;
      case 'recibo': return <ReciboDespesaPage />;
      default: return null;
    }
  };

  if (activeModule) {
    return (
      <div className="animate-fadeIn">
        <button 
          onClick={() => setActiveModule(null)} 
          className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-widest group"
        >
          <div className="p-1 rounded-full border border-slate-200 group-hover:border-blue-500 transition-colors">
            <ArrowLeft size={16} />
          </div>
          <span>Voltar para Modelos</span>
        </button>
        {renderContent()}
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
          Modelos de Documentos
        </h2>
        <p className="text-slate-500 font-medium">Templates oficiais para emissão e personalização.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {models.map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveModule(item.id)}
            className="flex flex-col items-start p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all duration-300 group text-left h-full relative overflow-hidden"
          >
             <div className={`p-4 rounded-2xl ${item.color} text-white mb-4 shadow-md group-hover:scale-110 transition-transform relative z-10`}>
              {item.icon}
            </div>
            
            <h3 className="text-lg font-bold text-[#001a33] mb-1 group-hover:text-blue-600 transition-colors relative z-10">
              {item.title}
            </h3>
            
            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-4 relative z-10">
              {item.desc}
            </p>

            <div className="mt-auto pt-4 border-t border-slate-50 w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-blue-600 transition-colors relative z-10">
              <span>Configurar</span>
              <Download size={14} />
            </div>

            {/* Background Decoration */}
            <div className={`absolute -bottom-8 -right-8 w-24 h-24 rounded-full opacity-0 group-hover:opacity-10 transition-opacity blur-xl ${item.color}`}></div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ModelosDocumentosPage;

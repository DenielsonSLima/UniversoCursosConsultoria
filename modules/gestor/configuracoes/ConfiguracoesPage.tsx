
import React, { useState } from 'react';
import { 
  Building2, 
  Users, 
  Stamp, 
  Landmark, 
  Wallet, 
  Wallet2,
  FileText, 
  CreditCard, 
  Server,
  ArrowLeft,
  Tags,
  Percent,
  Calculator,
  MessageCircle,
  FileCode2,
  GraduationCap,
  Megaphone
} from 'lucide-react';

// Importação dos Submódulos
import EmpresasConfig from './empresas/EmpresasConfig';
import UsuariosConfig from './usuarios/UsuariosConfig';
import MarcaDaguaConfig from './marca-dagua/MarcaDaguaConfig';
import ContasBancariasConfig from './contas-bancarias/ContasBancariasConfig';
import SaldoInicialConfig from './saldo-inicial/SaldoInicialConfig';
import AsaasConfig from './asaas/AsaasConfig';
import ApiStatusConfig from './api-status/ApiStatusConfig';
import CategoriasConfig from './categorias/CategoriasConfig';
import RegrasCobrancaConfig from './regras-cobranca/RegrasCobrancaConfig';
import TaxasPagamentoConfig from './taxas-pagamento/TaxasPagamentoConfig';
import MensageriaConfig from './mensageria/MensageriaConfig';
import TemplatesMensagensConfig from './templates-mensagens/TemplatesMensagensConfig';
import PolosConfig from './polos/PolosConfig';
import AcademicosConfig from './academicos/AcademicosConfig';
import AssinaturasConfig from './assinaturas/AssinaturasConfig';
import CategoriasFinanceirasConfig from './categorias-financeiras/CategoriasFinanceirasConfig';
import SitePublicoConfig from './site-publico/SitePublicoConfig';

const ConfiguracoesPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const menuItems = [
    { id: 'empresas', title: 'Dados da Empresa', desc: 'CNPJ, Endereço e Logo', icon: <Building2 size={24} />, color: 'bg-blue-500' },
    { id: 'polos', title: 'Polos e Filiais', desc: 'Gestão das unidades', icon: <Building2 size={24} />, color: 'bg-sky-500' },
    { id: 'academicos', title: 'Matrícula e Validação', desc: 'Configurações de registros, carteirinhas e certificados', icon: <GraduationCap size={24} />, color: 'bg-purple-500' },
    { id: 'site-publico', title: 'Site Público', desc: 'Faixa de avisos e turmas abertas', icon: <Megaphone size={24} />, color: 'bg-blue-700' },
    { id: 'categorias', title: 'Categorias (Parceiros)', desc: 'Classificação de cadastros', icon: <Tags size={24} />, color: 'bg-orange-500' },
    { id: 'categorias-financeiras', title: 'Categorias Financeiras', desc: 'Despesas fixas, variáveis e outros débitos', icon: <Wallet2 size={24} />, color: 'bg-rose-600' },
    { id: 'usuarios', title: 'Usuários e Permissões', desc: 'Gestão de acesso ao sistema', icon: <Users size={24} />, color: 'bg-indigo-500' },
    { id: 'marca-dagua', title: 'Marca D\'água', desc: 'Personalização de documentos', icon: <Stamp size={24} />, color: 'bg-cyan-500' },
    { id: 'assinaturas', title: 'Central de Assinaturas', desc: 'Diretoria, Secretaria e Coordenação', icon: <Stamp size={24} />, color: 'bg-pink-600' },
    { id: 'contas', title: 'Contas Bancárias', desc: 'Contas para recebimento', icon: <Landmark size={24} />, color: 'bg-emerald-500' },
    { id: 'saldo', title: 'Saldo Inicial', desc: 'Ajuste de caixa inicial', icon: <Wallet size={24} />, color: 'bg-teal-500' },
    { id: 'logs', title: 'Logs e Eventos', desc: 'Auditoria do sistema', icon: <FileText size={24} />, color: 'bg-slate-500' },
    { id: 'regras-cobranca', title: 'Regras de Cobrança', desc: 'Juros, multas e descontos', icon: <Percent size={24} />, color: 'bg-yellow-500' },
    { id: 'taxas-pagamento', title: 'Taxas e Formas Pgto', desc: 'Descontos de maquininhas', icon: <Calculator size={24} />, color: 'bg-fuchsia-500' },
    { id: 'mensageria', title: 'Mensageria', desc: 'WhatsApp e E-mail', icon: <MessageCircle size={24} />, color: 'bg-green-500' },
    { id: 'templates-mensagens', title: 'Templates', desc: 'Textos de notificação', icon: <FileCode2 size={24} />, color: 'bg-blue-400' },
    { id: 'asaas', title: 'Integração Asaas', desc: 'Configuração de Pagamentos', icon: <CreditCard size={24} />, color: 'bg-rose-500' },
    { id: 'api', title: 'Status da API', desc: 'Monitoramento de serviços', icon: <Server size={24} />, color: 'bg-violet-500' },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case 'empresas': return <EmpresasConfig />;
      case 'polos': return <PolosConfig />;
      case 'academicos': return <AcademicosConfig />;
      case 'site-publico': return <SitePublicoConfig />;
      case 'categorias': return <CategoriasConfig />;
      case 'categorias-financeiras': return <CategoriasFinanceirasConfig />;
      case 'usuarios': return <UsuariosConfig />;
      case 'marca-dagua': return <MarcaDaguaConfig />;
      case 'assinaturas': return <AssinaturasConfig />;
      case 'contas': return <ContasBancariasConfig />;
      case 'saldo': return <SaldoInicialConfig />;
      case 'regras-cobranca': return <RegrasCobrancaConfig />;
      case 'taxas-pagamento': return <TaxasPagamentoConfig />;
      case 'mensageria': return <MensageriaConfig />;
      case 'templates-mensagens': return <TemplatesMensagensConfig />;
      case 'asaas': return <AsaasConfig />;
      case 'api': return <ApiStatusConfig />;
      default: return null;
    }
  };

  if (activeSection) {
    return (
      <div className="animate-fadeIn">
        <button 
          onClick={() => setActiveSection(null)} 
          className="mb-6 flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-widest group"
        >
          <div className="p-1 rounded-full border border-slate-200 group-hover:border-blue-500 transition-colors">
            <ArrowLeft size={16} />
          </div>
          <span>Voltar para Configurações</span>
        </button>
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 min-h-[600px]">
          {renderSection()}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">Configurações</h2>
        <p className="text-slate-500">Gerencie todos os parâmetros do sistema Universo.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            className="flex flex-col items-start p-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all duration-300 group text-left h-full"
          >
            <div className={`p-4 rounded-2xl ${item.color} text-white mb-4 shadow-md group-hover:scale-110 transition-transform`}>
              {item.icon}
            </div>
            <h3 className="text-lg font-bold text-[#001a33] mb-1 group-hover:text-blue-600 transition-colors">
              {item.title}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
              {item.desc}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ConfiguracoesPage;

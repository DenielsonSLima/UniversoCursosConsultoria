import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  ScrollText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Printer,
  X,
  Check,
  AlertCircle,
  DollarSign
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { formatMatricula } from '../../../../../../lib/academicUtils';
import { secretariaService, type Solicitacao } from '../../../../secretaria/secretaria.service';
import { alunoSecretariaService } from '../../../../../aluno/secretaria/secretaria-aluno.service';
import { declaracaoService } from '../../../../cadastros/modelos-documentos/declaracao/declaracao.service';
import { irpfService } from '../../../../cadastros/modelos-documentos/irpf/irpf.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { academicosService } from '../../../../configuracoes/academicos/academicos.service';
import DocumentHeader from '../../../../components/DocumentHeader';
import { useDocumentValidationCode } from '../../../../../shared/document-validation/use-document-validation-code';
import { getDocumentValidationUrl } from '../../../../../shared/document-validation/document-validation.url';
import {
  formatIrpfReleaseDate,
  getDefaultIrpfCalendarYear,
  getIrpfCalendarYearOptions,
  isIrpfYearReleased,
} from '../../../../../../lib/irpfYearUtils';
import { sanitizedHtml } from '../../../../../../lib/htmlSanitizer';

interface ParceiroAlunoSecretariaProps {
  alunoId: string;
}

const ParceiroAlunoSecretaria: React.FC<ParceiroAlunoSecretariaProps> = ({ alunoId }) => {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [actionType, setActionType] = useState<'deferir' | 'indeferir' | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');

  // Modais de Visualização do Documento
  const [isBoletimOpen, setIsBoletimOpen] = useState(false);
  const [isDeclaracaoOpen, setIsDeclaracaoOpen] = useState(false);
  const [isIRPFOpen, setIsIRPFOpen] = useState(false);
  const [selectedIrpfYear, setSelectedIrpfYear] = useState(() => getDefaultIrpfCalendarYear());

  // 1. Busca dados cadastrais do aluno
  const { data: aluno, isLoading: loadingAluno } = useQuery({
    queryKey: ['secretaria-aluno-profile', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parceiros')
        .select('*')
        .eq('id', alunoId)
        .single();
      if (error) throw error;
      return data;
    }
  });

  // 2. Busca as matrículas do aluno e turmas
  const { data: matriculas = [], isLoading: loadingMatriculas } = useQuery<any[]>({
    queryKey: ['secretaria-aluno-matriculas', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('*, turmas(*, cursos(*), polos(nome))')
        .eq('aluno_id', alunoId);
      if (error) throw error;
      return data || [];
    }
  });

  const activeMatricula = matriculas.find(m => m.status?.toUpperCase() === 'ATIVO') || matriculas[0];
  const activeTechnicalMatricula = matriculas.find(
    (m) =>
      m.status?.toUpperCase() === 'ATIVO' &&
      m.turmas?.status?.toUpperCase() === 'EM_ANDAMENTO' &&
      m.turmas?.cursos?.modalidade === 'TECNICO'
  );
  const irpfMatricula = activeMatricula || matriculas[0] || null;
  const isTechnicalIdentityAvailable = Boolean(activeTechnicalMatricula);
  const formattedMat = activeMatricula 
    ? formatMatricula(activeMatricula.id, activeMatricula.data_matricula, activeMatricula.polo_id) 
    : 'PENDENTE';
  const enrollmentDeclarationValidation = useDocumentValidationCode(
    activeMatricula
      ? {
          type: 'declaracao_matricula',
          enrollmentId: activeMatricula.id,
        }
      : null,
    isDeclaracaoOpen
  );
  // 3. Busca notas do diário de classe
  const { data: notas = [] } = useQuery<any[]>({
    queryKey: ['secretaria-aluno-notas', activeMatricula?.turma_id],
    queryFn: async () => {
      if (!activeMatricula?.turma_id) return [];
      const { data, error } = await supabase
        .from('diario_notas')
        .select('*, disciplinas(*)')
        .eq('turma_id', activeMatricula.turma_id)
        .eq('aluno_id', alunoId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeMatricula?.turma_id
  });

  // Busca o template de declaração do polo
  const { data: templateData } = useQuery({
    queryKey: ['print-declaracao-template', activeMatricula?.polo_id],
    queryFn: async () => {
      if (!activeMatricula?.polo_id) return null;
      return declaracaoService.getTemplate(activeMatricula.polo_id);
    },
    enabled: !!activeMatricula?.polo_id,
  });

  // Busca o template de IRPF do polo
  const { data: irpfTemplateData } = useQuery({
    queryKey: ['print-irpf-template', activeMatricula?.polo_id],
    queryFn: async () => {
      if (!activeMatricula?.polo_id) return null;
      return irpfService.getTemplate(activeMatricula.polo_id);
    },
    enabled: !!activeMatricula?.polo_id,
  });

  const irpfLiberacaoDate = irpfTemplateData?.liberacaoDate || '03-01';
  const irpfYearOptions = getIrpfCalendarYearOptions(irpfLiberacaoDate);
  const selectedIrpfYearReleaseLabel = formatIrpfReleaseDate(selectedIrpfYear, irpfLiberacaoDate);
  const isSelectedIrpfYearReleased = isIrpfYearReleased(selectedIrpfYear, irpfLiberacaoDate);
  const irpfValidation = useDocumentValidationCode(
    irpfMatricula
      ? {
          type: 'declaracao_irpf',
          enrollmentId: irpfMatricula.id,
          referencePeriod: String(selectedIrpfYear),
          registerReissue: true,
        }
      : null,
    isIRPFOpen && isSelectedIrpfYearReleased
  );

  useEffect(() => {
    const defaultYear = getDefaultIrpfCalendarYear(irpfLiberacaoDate);
    setSelectedIrpfYear((currentYear) =>
      isIrpfYearReleased(currentYear, irpfLiberacaoDate) ? currentYear : defaultYear
    );
  }, [irpfLiberacaoDate]);

  // Busca pagamentos do aluno no ano-calendário selecionado para IRPF
  const { data: irpfPayments = [] } = useQuery<any[]>({
    queryKey: ['secretaria-aluno-irpf-payments', alunoId, selectedIrpfYear],
    queryFn: async () => {
      return alunoSecretariaService.getPagamentosIrpf(alunoId, String(selectedIrpfYear), irpfMatricula?.turma_id);
    },
    enabled: isSelectedIrpfYearReleased,
  });

  // Busca o polo completo
  const { data: poloData } = useQuery({
    queryKey: ['print-polo-details', activeMatricula?.polo_id],
    queryFn: async () => {
      if (!activeMatricula?.polo_id) return null;
      const { data, error } = await supabase
        .from('polos')
        .select('*')
        .eq('id', activeMatricula.polo_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!activeMatricula?.polo_id,
  });

  // Busca as marcas d'água
  const { data: watermarkData } = useQuery({
    queryKey: ['print-watermarks'],
    queryFn: async () => {
      return marcaDaguaService.getCompaniesWithWatermark();
    },
  });

  const watermark = watermarkData?.find((w: any) => w.id === activeMatricula?.polo_id);

  // Busca a configuração do QR Code
  const { data: qrConfig } = useQuery({
    queryKey: ['print-declaracao-qr-config'],
    queryFn: async () => {
      return declaracaoService.getQrConfig();
    },
  });

  // Busca as configurações acadêmicas globais
  const { data: academicConfigs } = useQuery({
    queryKey: ['print-academic-configs'],
    queryFn: async () => {
      return academicosService.getConfigs();
    },
  });

  // Busca a configuração do QR Code de IRPF
  const { data: irpfQrConfig } = useQuery({
    queryKey: ['print-irpf-qr-config'],
    queryFn: async () => {
      return irpfService.getQrConfig();
    },
  });

  const getValidationCode = () => {
    if (enrollmentDeclarationValidation.data?.code) {
      return enrollmentDeclarationValidation.data.code;
    }
    let codeStr = formattedMat; // fallback
    if (qrConfig && qrConfig.pattern && activeMatricula) {
      codeStr = qrConfig.pattern.map((token: string) => {
          if (token === '{POLO_ID}') return (activeMatricula.polo_id || '').slice(0,3).toUpperCase();
          if (token === '{CURSO_ID}') return (activeMatricula.turmas?.cursos?.id || '').slice(0,4).toUpperCase();
          if (token === '{ALUNO_MATRICULA}') return activeMatricula.id.toString();
          if (token === '{ALUNO_CPF}') return (aluno?.cpf || '').replace(/\D/g, '');
          if (token === '{DATA_DIA}') return new Date().getDate().toString().padStart(2, '0');
          if (token === '{DATA_MES}') return (new Date().getMonth() + 1).toString().padStart(2, '0');
          if (token === '{ANO_ATUAL}') return new Date().getFullYear().toString();
          if (token === '{RANDOM_HASH}') return activeMatricula.id.slice(-6).toUpperCase();
          return token.replace(/[{}]/g, '').substring(0, 4);
      }).join(qrConfig.separator || '-');
    }
    return 'DEC-' + codeStr;
  };

  const getQrCodeExampleUrl = () => {
    if (enrollmentDeclarationValidation.data?.code) {
      return getDocumentValidationUrl(enrollmentDeclarationValidation.data.code);
    }
    const baseUrl = academicConfigs?.validacaoUrl || 'https://www.universocc.com.br/validador';
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}q=${getValidationCode()}`;
  };

  const getValidationCodeIRPF = () => {
    if (irpfValidation.data?.code) return irpfValidation.data.code;
    let codeStr = formattedMat; // fallback
    if (irpfQrConfig && irpfQrConfig.pattern && activeMatricula) {
      codeStr = irpfQrConfig.pattern.map((token: string) => {
          if (token === '{POLO_ID}') return (activeMatricula.polo_id || '').slice(0,3).toUpperCase();
          if (token === '{CURSO_ID}') return (activeMatricula.turmas?.cursos?.id || '').slice(0,4).toUpperCase();
          if (token === '{ALUNO_MATRICULA}') return activeMatricula.id.toString();
          if (token === '{ALUNO_CPF}') return (aluno?.cpf || '').replace(/\D/g, '');
          if (token === '{DATA_DIA}') return new Date().getDate().toString().padStart(2, '0');
          if (token === '{DATA_MES}') return (new Date().getMonth() + 1).toString().padStart(2, '0');
          if (token === '{ANO_ATUAL}') return new Date().getFullYear().toString();
          if (token === '{RANDOM_HASH}') return activeMatricula.id.slice(-6).toUpperCase();
          return token.replace(/[{}]/g, '').substring(0, 4);
      }).join(irpfQrConfig.separator || '-');
    }
    return 'IRPF-' + codeStr;
  };

  const getQrCodeExampleUrlIRPF = () => {
    if (irpfValidation.data?.code) {
      return getDocumentValidationUrl(irpfValidation.data.code);
    }
    const baseUrl = academicConfigs?.validacaoUrl || 'https://www.universocc.com.br/validador';
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}q=${getValidationCodeIRPF()}`;
  };

  // Portuguese number to words helper
  const valorPorExtenso = (valor: number): string => {
    if (valor === 0) return 'zero reais';
    
    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const dezenas = ['', 'dez', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const onzeADezenove = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    
    const converterGrupo = (n: number): string => {
      let output = '';
      const c = Math.floor(n / 100);
      const d = Math.floor((n % 100) / 10);
      const u = n % 10;
      
      if (c > 0) {
        if (c === 1 && d === 0 && u === 0) {
          output += 'cem';
        } else {
          output += centenas[c];
        }
      }
      
      if (d > 0) {
        if (output !== '') output += ' e ';
        if (d === 1) {
          output += onzeADezenove[u];
          return output;
        } else {
          output += dezenas[d];
        }
      }
      
      if (u > 0) {
        if (output !== '') output += ' e ';
        output += unidades[u];
      }
      
      return output;
    };

    const partes = [];
    const inteiro = Math.floor(valor);
    const centavos = Math.round((valor - inteiro) * 100);

    if (inteiro > 0) {
      const milhoes = Math.floor(inteiro / 1000000);
      const milhares = Math.floor((inteiro % 1000000) / 1000);
      const unidadesSimples = inteiro % 1000;

      if (milhoes > 0) {
        partes.push(converterGrupo(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
      }
      if (milhares > 0) {
        partes.push(converterGrupo(milhares) + ' mil');
      }
      if (unidadesSimples > 0) {
        partes.push(converterGrupo(unidadesSimples));
      }
      
      partes.push(inteiro === 1 ? 'real' : 'reais');
    }

    if (centavos > 0) {
      partes.push('e ' + converterGrupo(centavos) + (centavos === 1 ? ' centavo' : ' centavos'));
    }

    return partes.join(' ').replace(/\s+/g, ' ').trim();
  };

  const replaceVariables = (text: string) => {
    if (!text) return '';
    
    const dataAtual = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    
    const horaAtual = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const getValidadeData = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() + (days || 30));
      return date.toLocaleDateString('pt-BR');
    };

    const vDays = templateData?.validityDays || 30;
    const alunoNome = aluno?.nome || '';
    const alunoCpf = aluno?.cpf_cnpj || '';
    const responsavelFinanceiroNome = aluno?.responsavel_financeiro && aluno?.responsavel_nome
      ? aluno.responsavel_nome
      : alunoNome;
    const responsavelFinanceiroCpf = aluno?.responsavel_financeiro && aluno?.responsavel_cpf
      ? aluno.responsavel_cpf
      : alunoCpf;
    const cursoNome = activeMatricula?.turmas?.cursos?.nome || '';
    const turmaNome = activeMatricula?.turmas?.nome || '';
    const poloNome = activeMatricula?.turmas?.polos?.nome || poloData?.nomeFantasia || '';
    const cidadePolo = poloData?.cidade || poloNome || 'Aracaju';

    const irpfTotalValue = irpfPayments.length > 0
      ? irpfPayments.reduce((acc, curr) => acc + Number(curr.valor_pago || curr.valor || 0), 0)
      : 0;
    const irpfTotalExtenso = valorPorExtenso(irpfTotalValue);
    const formattedIrpfTotal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(irpfTotalValue);

    return text
      .replace(/\{\{ALUNO_NOME\}\}/g, alunoNome.toUpperCase())
      .replace(/\{ALUNO_NOME\}/g, alunoNome.toUpperCase())
      .replace(/\{\{ALUNO_CPF\}\}/g, alunoCpf)
      .replace(/\{ALUNO_CPF\}/g, alunoCpf)
      .replace(/\{\{RESPONSAVEL_FINANCEIRO_NOME\}\}/g, responsavelFinanceiroNome.toUpperCase())
      .replace(/\{RESPONSAVEL_FINANCEIRO_NOME\}/g, responsavelFinanceiroNome.toUpperCase())
      .replace(/\{\{RESPONSAVEL_FINANCEIRO_CPF\}\}/g, responsavelFinanceiroCpf)
      .replace(/\{RESPONSAVEL_FINANCEIRO_CPF\}/g, responsavelFinanceiroCpf)
      .replace(/\{\{ALUNO_RG\}\}/g, aluno?.rg || '')
      .replace(/\{ALUNO_RG\}/g, aluno?.rg || '')
      .replace(/\{\{ALUNO_MATRICULA\}\}/g, formattedMat || '')
      .replace(/\{ALUNO_MATRICULA\}/g, formattedMat || '')
      .replace(/\{\{CURSO_NOME\}\}/g, cursoNome.toUpperCase())
      .replace(/\{CURSO_NOME\}/g, cursoNome.toUpperCase())
      .replace(/\{\{TURMA_NOME\}\}/g, turmaNome)
      .replace(/\{TURMA_NOME\}/g, turmaNome)
      .replace(/\{\{POLO_NOME\}\}/g, poloNome)
      .replace(/\{POLO_NOME\}/g, poloNome)
      .replace(/\{\{CIDADE_POLO\}\}/g, cidadePolo)
      .replace(/\{CIDADE_POLO\}/g, cidadePolo)
      .replace(/\{\{DATA_ATUAL\}\}/g, dataAtual)
      .replace(/\{DATA_ATUAL\}/g, dataAtual)
      .replace(/\{\{HORA_ATUAL\}\}/g, horaAtual)
      .replace(/\{HORA_ATUAL\}/g, horaAtual)
      .replace(/\{\{DATA_GERACAO\}\}/g, `${new Date().toLocaleDateString('pt-BR')} às ${horaAtual}`)
      .replace(/\{DATA_GERACAO\}/g, `${new Date().toLocaleDateString('pt-BR')} às ${horaAtual}`)
      .replace(/\{\{VALIDADE_DIAS\}\}/g, String(vDays))
      .replace(/\{VALIDADE_DIAS\}/g, String(vDays))
      .replace(/\{\{VALIDADE_DATA\}\}/g, getValidadeData(vDays))
      .replace(/\{VALIDADE_DATA\}/g, getValidadeData(vDays))
      .replace(/\{\{ANO_CALENDARIO\}\}/g, String(selectedIrpfYear))
      .replace(/\{ANO_CALENDARIO\}/g, String(selectedIrpfYear))
      .replace(/\{\{VALOR_TOTAL\}\}/g, formattedIrpfTotal)
      .replace(/\{VALOR_TOTAL\}/g, formattedIrpfTotal)
      .replace(/\{\{VALOR_EXTENSO\}\}/g, irpfTotalExtenso)
      .replace(/\{VALOR_EXTENSO\}/g, irpfTotalExtenso);
  };

  // Carrega solicitações do Supabase — NUNCA localStorage
  const loadSolicitacoes = async () => {
    const list = await secretariaService.getSolicitacoesByAluno(alunoId);
    setSolicitacoes(list);
  };

  useEffect(() => {
    loadSolicitacoes();
  }, [alunoId]);

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSolicitacao || !actionType) return;

    const novoStatus = actionType === 'deferir' ? 'Deferido' : 'Indeferido';
    const novaResposta = actionType === 'deferir'
      ? (documentUrl.trim() || 'Solicitação atendida. O documento foi homologado pela secretaria.')
      : justificativa.trim();

    // Salva no Supabase — NUNCA localStorage
    await secretariaService.updateSolicitacao(selectedSolicitacao.id, {
      status: novoStatus as any,
      resposta: novaResposta,
      respostaData: new Date().toISOString().split('T')[0]
    });

    // Recarrega do Supabase para manter sincronia
    await loadSolicitacoes();
    setSelectedSolicitacao(null);
    setActionType(null);
    setJustificativa('');
    setDocumentUrl('');
    alert(`Solicitação ${actionType === 'deferir' ? 'deferida' : 'indeferida'} com sucesso!`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Deferido':
        return <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full text-[9px] font-black uppercase"><CheckCircle size={10} /> Deferido</span>;
      case 'Indeferido':
        return <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100 px-2 py-0.5 rounded-full text-[9px] font-black uppercase"><XCircle size={10} /> Indeferido</span>;
      default:
        return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full text-[9px] font-black uppercase"><Clock size={10} /> Pendente</span>;
    }
  };

  const printRegisteredDocument = (code: string | undefined, label: string) => {
    if (!code) {
      alert(`Aguarde o registro do código da ${label}.`);
      return;
    }
    window.print();
  };

  if (loadingAluno || loadingMatriculas) {
    return (
      <div className="flex justify-center items-center py-12">
        <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Carregando dados da secretaria...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fadeIn text-xs font-sans">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Secretaria do Aluno</h3>
          <p className="text-slate-500 font-medium">Ações acadêmicas e acompanhamento de solicitações para este cadastro.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsBoletimOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-700 rounded-xl font-bold uppercase text-[10px] hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ScrollText size={14} /> Emitir Boletim
          </button>
          <button 
            onClick={() => setIsDeclaracaoOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#001a33] text-white rounded-xl font-bold uppercase text-[10px] hover:bg-blue-900 transition-colors shadow-md"
          >
            <FileText size={14} /> Emitir Declaração
          </button>
          {isTechnicalIdentityAvailable && (
            <button 
              onClick={() => setIsIRPFOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-xl font-bold uppercase text-[10px] hover:bg-teal-700 transition-colors shadow-md"
            >
              <DollarSign size={14} /> Emitir IRPF
            </button>
          )}
          {!isTechnicalIdentityAvailable && (
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              IRPF disponível apenas para matrícula ativa em curso técnico.
            </p>
          )}
        </div>
      </div>

      {/* Solicitações Section */}
      <div className="space-y-4">
        <h4 className="font-black text-[#001a33] uppercase text-sm tracking-tight">Chamados e Solicitações Acadêmicas</h4>
        <div className="overflow-x-auto bg-slate-50/50 rounded-2xl border border-slate-150">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-150 text-slate-450 font-black tracking-wider text-[9px] uppercase">
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Data Pedido</th>
                <th className="px-4 py-3">Prazo Regulamentar</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação / Retorno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
              {solicitacoes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Nenhuma solicitação acadêmica registrada para este aluno.
                  </td>
                </tr>
              ) : (
                solicitacoes.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 py-3 font-bold text-[#001a33]">{item.tipo}</td>
                    <td className="px-4 py-3">{item.dataSolicitacao.split('-').reverse().join('/')}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded font-black text-[9px]">
                        {item.prazo}
                      </span>
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(item.status)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'Pendente' ? (
                        <button 
                          onClick={() => setSelectedSolicitacao(item)}
                          className="px-3 py-1.5 bg-[#001a33] hover:bg-blue-600 text-white rounded-lg font-bold uppercase tracking-wider text-[9px]"
                        >
                          Analisar
                        </button>
                      ) : (
                        <span className="text-slate-500 italic text-[10px] font-semibold" title={item.resposta}>
                          {item.status === 'Deferido' ? 'Deferido' : 'Indeferido'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BOLETIM MODAL */}
      {isBoletimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ScrollText className="text-blue-600" size={20} />
                <h4 className="font-black text-[#001a33] text-base uppercase tracking-tight">Boletim Informativo de Notas</h4>
              </div>
              <button 
                onClick={() => setIsBoletimOpen(false)}
                className="p-2 bg-white border border-slate-250 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 border border-slate-150 rounded-2xl">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Curso</span>
                  <span className="font-black text-slate-800 text-xs uppercase">{activeMatricula?.turmas?.cursos?.nome || 'CURSO GERAL'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Turma</span>
                  <span className="font-black text-slate-800 text-xs uppercase">{activeMatricula?.turmas?.codigo || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Polo Vinculado</span>
                  <span className="font-black text-slate-800 text-xs uppercase">{activeMatricula?.turmas?.polos?.nome || 'Matriz'}</span>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-black uppercase text-[9px] tracking-wider">
                    <th className="py-2.5">Disciplina</th>
                    <th className="py-2.5 text-center w-14">Prova (P)</th>
                    <th className="py-2.5 text-center w-14">Trab. (T)</th>
                    <th className="py-2.5 text-center w-14">Qual. (Q)</th>
                    <th className="py-2.5 text-center w-14">Média</th>
                    <th className="py-2.5 text-center w-16">Frequência</th>
                    <th className="py-2.5 text-right w-24">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                  {notas.length === 0 ? (
                    activeMatricula?.turmas?.cursos?.nome ? (
                      [
                        { disc: 'Anatomia e Fisiologia Humana', p: 8.5, t: 9.0, q: 10, m: 9.0, f: 100, res: 'Aprovado' },
                        { disc: 'Fundamentos de Enfermagem', p: 7.0, t: 8.5, q: 9.0, m: 7.8, f: 95, res: 'Aprovado' },
                        { disc: 'Farmacologia Aplicada', p: 5.5, t: 6.0, q: 8.5, m: 6.2, f: 90, res: 'Aprovado' },
                        { disc: 'Enfermagem em Centro Cirúrgico', p: 9.0, t: 9.5, q: 10, m: 9.3, f: 100, res: 'Aprovado' }
                      ].map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="py-3.5 text-slate-900">{item.disc}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{item.p.toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{item.t.toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{item.q.toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-900">{item.m.toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{item.f}%</td>
                          <td className="py-3.5 text-right">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase rounded">
                              {item.res}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400 font-bold uppercase text-[9px]">
                          Nenhum lançamento de notas encontrado para este curso no diário do professor.
                        </td>
                      </tr>
                    )
                  ) : (
                    notas.map((n) => {
                      const media = parseFloat(n.nota_final || n.media_final || 0);
                      const approved = media >= 6.0;
                      return (
                        <tr key={n.id} className="hover:bg-slate-50/50">
                          <td className="py-3.5 text-slate-900">{n.disciplinas?.nome}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{parseFloat(n.nota_p || 0).toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{parseFloat(n.nota_ti || 0).toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{parseFloat(n.nota_cq || 0).toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-900">{media.toFixed(1)}</td>
                          <td className="py-3.5 text-center font-mono text-slate-500">{n.frequencia_percent || 100}%</td>
                          <td className="py-3.5 text-right">
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${approved ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                              {approved ? 'Aprovado' : 'Reprovado'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end print:hidden">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-900 transition-colors shadow-lg"
              >
                <Printer size={14} /> Imprimir Boletim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DECLARAÇÃO DE CURSANDO MODAL */}
      {isDeclaracaoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-[858px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-600" size={20} />
                <h4 className="font-black text-[#001a33] text-base uppercase tracking-tight">Declaração de Cursando Digital</h4>
              </div>
              <button 
                onClick={() => setIsDeclaracaoOpen(false)}
                className="p-2 bg-white border border-slate-250 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm"
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-auto flex-1 bg-slate-100 flex justify-center p-8 custom-scrollbar">
              <div 
                id="print-area"
                className="bg-white shadow-md relative shrink-0 text-black text-justify"
                style={{ 
                  width: '794px', 
                  height: '1123px', 
                  minHeight: '1123px',
                  padding: '60px 80px', 
                  position: 'relative'
                }}
              >
                {/* 1. Marca D'água */}
                {watermark?.watermarkUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                    <img 
                      src={watermark.watermarkUrl} 
                      alt="Watermark" 
                      style={{
                        opacity: watermark.watermarkOpacity || 0.1,
                        width: `${watermark.watermarkScale || 50}%`,
                        transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none'
                      }}
                    />
                  </div>
                )}

                {/* 2. Cabeçalho */}
                {poloData && <DocumentHeader polo={poloData} orientation="portrait" />}

                {/* Título */}
                <div className="text-center mb-12 relative z-10">
                  <h2 className="text-2xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-blue-600 underline-offset-4">
                    Declaração de Matrícula
                  </h2>
                </div>

                {/* 3. Corpo do Texto */}
                <div className="relative z-20 mb-20 text-justify leading-loose text-lg text-black animate-fadeIn" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                  <div dangerouslySetInnerHTML={sanitizedHtml(replaceVariables(templateData?.textContent || ''))} />
                </div>

                {/* 4. Campos Absolutos */}
                {(templateData?.absoluteFields || []).map((field: any) => (
                  <div 
                    key={field.id}
                    className="absolute z-30 flex items-center justify-center"
                    style={{ 
                      left: field.x, 
                      top: field.y,
                      color: '#000',
                      width: field.width ? `${field.width}px` : 'auto',
                      height: 'auto',
                      ...field.style
                    }}
                  >
                    {field.type === 'qrcode' && (
                      <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                        <div className="w-full aspect-square bg-white flex items-center justify-center mb-1">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQrCodeExampleUrl())}`} 
                            alt="QR Code"
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        </div>
                        <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5">
                          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">CÓD. VALIDAÇÃO</p>
                          <p className="text-[9px] font-mono font-black text-blue-600 tracking-wider mt-1 leading-none">
                            {getValidationCode()}
                          </p>
                        </div>
                      </div>
                    )}

                    {field.type === 'image' && (
                      <img 
                        src={field.value} 
                        alt="Assinatura" 
                        className="w-full h-auto object-contain pointer-events-none"
                      />
                    )}

                    {field.type === 'text' && (
                      <span
                        className="whitespace-pre-line"
                        dangerouslySetInnerHTML={sanitizedHtml(replaceVariables(field.value))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 print:hidden">
              <button 
                onClick={() => setIsDeclaracaoOpen(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px] rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button 
                onClick={() => printRegisteredDocument(enrollmentDeclarationValidation.data?.code, 'declaração')}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-900 transition-colors shadow-lg"
              >
                <Printer size={14} /> Imprimir Declaração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DECLARAÇÃO DE IRPF MODAL */}
      {isIRPFOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-[858px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-teal-650 text-teal-600" size={20} />
                <h4 className="font-black text-[#001a33] text-base uppercase tracking-tight">Declaração de Rendimentos (IRPF)</h4>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => printRegisteredDocument(irpfValidation.data?.code, 'declaração de IRPF')}
                  disabled={!isSelectedIrpfYearReleased}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#001a33] text-white hover:bg-blue-900 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors"
                >
                  <Printer size={13} /> Imprimir
                </button>
                <button onClick={() => setIsIRPFOpen(false)} className="p-2 bg-white border border-slate-250 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm">
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="overflow-auto flex-1 bg-slate-100 flex flex-col items-center gap-4 p-8 custom-scrollbar">
              <div className="print:hidden w-[794px] max-w-full rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Ano-calendário</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <select
                        value={selectedIrpfYear}
                        onChange={(event) => setSelectedIrpfYear(Number(event.target.value))}
                        className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-[#001a33] outline-none focus:border-teal-500"
                      >
                        {irpfYearOptions.map((option) => (
                          <option key={option.year} value={option.year}>
                            {option.year}{option.released ? '' : ` - libera em ${option.releaseLabel}`}
                          </option>
                        ))}
                      </select>
                      <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
                        isSelectedIrpfYearReleased
                          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                          : 'border-amber-100 bg-amber-50 text-amber-700'
                      }`}>
                        {isSelectedIrpfYearReleased ? 'Disponível' : 'Aguardando liberação'}
                      </span>
                    </div>
                  </div>
                  <p className="max-w-sm text-[11px] font-bold leading-relaxed text-slate-500">
                    {isSelectedIrpfYearReleased
                      ? `Pode emitir a declaração referente aos pagamentos de ${selectedIrpfYear}.`
                      : `A declaração do ano-calendário ${selectedIrpfYear} estará disponível a partir de ${selectedIrpfYearReleaseLabel}.`}
                  </p>
                </div>
              </div>
              <div 
                id="print-area-irpf"
                className="bg-white shadow-md relative shrink-0 text-black text-justify"
                style={{ 
                  width: '794px', 
                  height: '1123px', 
                  minHeight: '1123px',
                  padding: '60px 80px', 
                  position: 'relative'
                }}
              >
                {/* 1. Marca D'água */}
                {watermark?.watermarkUrl && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                    <img 
                      src={watermark.watermarkUrl} 
                      alt="Watermark" 
                      style={{
                        opacity: watermark.watermarkOpacity || 0.1,
                        width: `${watermark.watermarkScale || 50}%`,
                        transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none'
                      }}
                    />
                  </div>
                )}

                {/* 2. Cabeçalho */}
                {poloData && <DocumentHeader polo={poloData} orientation="portrait" />}

                {/* Título */}
                <div className="text-center mb-12 relative z-10">
                  <h2 className="text-xl font-bold text-[#001a33] uppercase underline decoration-2 decoration-emerald-600 underline-offset-4 tracking-wider">
                    DECLARAÇÃO DE ANUIDADE / RENDIMENTOS ESCOLARES
                  </h2>
                </div>

                {/* 3. Corpo do Texto */}
                <div className="relative z-20 mb-20 text-justify leading-loose text-base text-black animate-fadeIn" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                  <div dangerouslySetInnerHTML={sanitizedHtml(replaceVariables(irpfTemplateData?.textContent || ''))} />
                </div>

                {/* 4. Campos Absolutos */}
                {(irpfTemplateData?.absoluteFields || []).map((field: any) => (
                  <div 
                    key={field.id}
                    className="absolute z-30 flex items-center justify-center"
                    style={{ 
                      left: field.x, 
                      top: field.y,
                      color: '#000',
                      width: field.width ? `${field.width}px` : 'auto',
                      height: 'auto',
                      ...field.style
                    }}
                  >
                    {field.type === 'qrcode' && (
                      <div className="w-full bg-white p-1.5 shadow-sm rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
                        <div className="w-full aspect-square bg-white flex items-center justify-center mb-1">
                          <img 
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(getQrCodeExampleUrlIRPF())}`} 
                            alt="QR Code"
                            className="w-full h-full object-contain pointer-events-none"
                          />
                        </div>
                        <div className="w-full flex flex-col gap-0.5 border-t border-slate-100 pt-1 mt-0.5">
                          <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest leading-none">CÓD. VALIDAÇÃO</p>
                          <p className="text-[9px] font-mono font-black text-emerald-600 tracking-wider mt-1 leading-none">
                            {getValidationCodeIRPF()}
                          </p>
                        </div>
                      </div>
                    )}

                    {field.type === 'image' && (
                      <img 
                        src={field.value} 
                        alt="Assinatura" 
                        className="w-full h-auto object-contain pointer-events-none"
                      />
                    )}

                    {field.type === 'text' && (
                      <span
                        className="whitespace-pre-line"
                        dangerouslySetInnerHTML={sanitizedHtml(replaceVariables(field.value))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 print:hidden">
              <button 
                onClick={() => setIsIRPFOpen(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px] rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button 
                onClick={() => printRegisteredDocument(irpfValidation.data?.code, 'declaração de IRPF')}
                disabled={!isSelectedIrpfYearReleased}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-blue-900 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors shadow-lg"
              >
                <Printer size={14} /> Imprimir IRPF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYSIS MODAL FOR ADMIN */}
      {selectedSolicitacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl relative overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h4 className="font-black text-[#001a33] text-sm uppercase tracking-wide">Análise de Solicitação</h4>
                <p className="text-[9px] text-slate-450 font-bold uppercase mt-0.5">Protocolo #{selectedSolicitacao.id}</p>
              </div>
              <button 
                onClick={() => { setSelectedSolicitacao(null); setActionType(null); }}
                className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Aluno</span>
                    <span className="font-bold text-[#001a33] text-xs">{selectedSolicitacao.alunoNome}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Matrícula</span>
                    <span className="font-bold text-slate-700 text-xs font-mono">{selectedSolicitacao.alunoMatricula}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Documento Solicitado</span>
                    <span className="font-bold text-slate-700 text-xs">{selectedSolicitacao.tipo}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">Prazo Regulamentar</span>
                    <span className="font-bold text-slate-750 text-xs">{selectedSolicitacao.prazo}</span>
                  </div>
                </div>
              </div>

              <form onSubmit={handleActionSubmit} className="space-y-4">
                {!actionType ? (
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setActionType('deferir')}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md shadow-emerald-900/10 flex items-center justify-center gap-2"
                    >
                      <Check size={16} /> Deferir (Aprovar)
                    </button>
                    <button
                      type="button"
                      onClick={() => setActionType('indeferir')}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md shadow-rose-900/10 flex items-center justify-center gap-2"
                    >
                      <X size={16} /> Indeferir (Rejeitar)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 animate-fadeIn">
                    {actionType === 'deferir' ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-slate-400 font-black uppercase tracking-wider text-[9px]">Mensagem ou Link do Documento</label>
                          <input 
                            type="text"
                            value={documentUrl}
                            onChange={(e) => setDocumentUrl(e.target.value)}
                            placeholder="Ex: Documento enviado para o e-mail / link do drive..."
                            required
                            className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-emerald-500 font-semibold text-slate-700 text-xs"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 leading-normal flex items-start gap-1 font-medium bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-100/50">
                          <AlertCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span>Ao deferir, o documento será marcado como disponível para o aluno no painel dele com o link acima.</span>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-slate-400 font-black uppercase tracking-wider text-[9px]">Justificativa do Indeferimento</label>
                          <textarea 
                            rows={3}
                            value={justificativa}
                            onChange={(e) => setJustificativa(e.target.value)}
                            placeholder="Digite o motivo detalhado para a rejeição da solicitação..."
                            required
                            className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-rose-500 font-medium text-slate-700 text-xs resize-none leading-relaxed"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setActionType(null)}
                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-655 font-bold uppercase tracking-wider text-[10px] rounded-lg transition-colors"
                      >
                        Voltar
                      </button>
                      <button
                        type="submit"
                        className={`px-5 py-2.5 text-white font-bold uppercase tracking-wider text-[10px] rounded-lg shadow-md transition-colors ${actionType === 'deferir' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                      >
                        Confirmar Homologação
                      </button>
                    </div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Embedded print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area *, #print-area-irpf, #print-area-irpf * {
            visibility: visible;
          }
          #print-area, #print-area-irpf {
            position: absolute;
            left: 0;
            top: 0;
            width: 794px !important;
            height: 1123px !important;
            padding: 60px 80px !important;
            box-shadow: none !important;
            border: none !important;
            background-color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}} />
    </div>
  );
};

export default ParceiroAlunoSecretaria;

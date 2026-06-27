import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, 
  ScrollText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Printer, 
  HelpCircle, 
  Send,
  Loader2,
  Calendar,
  DollarSign,
  Download,
  X,
  CreditCard,
  BadgeCheck,
  AlertTriangle
} from 'lucide-react';
import CarteirinhaPreview from '../../gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../gestor/cadastros/modelos-documentos/cracha/components/CrachaPreview';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { formatMatricula } from '../../../lib/academicUtils';
import { declaracaoService } from '../../gestor/cadastros/modelos-documentos/declaracao/declaracao.service';
import { irpfService } from '../../gestor/cadastros/modelos-documentos/irpf/irpf.service';
import { marcaDaguaService } from '../../gestor/configuracoes/marca-dagua/marca-dagua.service';
import { academicosService } from '../../gestor/configuracoes/academicos/academicos.service';
import DocumentHeader from '../../gestor/components/DocumentHeader';
import { useDocumentValidationCode } from '../../shared/document-validation/use-document-validation-code';
import {
  getDocumentValidationQrUrl,
  getDocumentValidationUrl,
} from '../../shared/document-validation/document-validation.url';
import { usePoloInstitutionalData } from '../../shared/polo-institutional/use-polo-institutional-data';
import { secretariaService } from '../../gestor/secretaria/secretaria.service';
import { carteirinhaService } from '../../gestor/cadastros/modelos-documentos/carteirinha/carteirinha.service';
import { crachaService } from '../../gestor/cadastros/modelos-documentos/cracha/cracha.service';

interface SecretariaPageProps {
  alunoId: string;
}

interface Solicitacao {
  id: string;
  alunoId: string;
  alunoNome: string;
  alunoMatricula: string;
  curso: string;
  tipo: 'Histórico Escolar' | 'Declaração IRPF' | 'Transferência';
  dataSolicitacao: string;
  prazo: string;
  status: 'Pendente' | 'Deferido' | 'Indeferido';
  resposta?: string;
  respostaData?: string;
}

interface PrazoConfig {
  prazo: string;
  descricao: string;
}

const DEFAULT_PRAZOS: Record<string, PrazoConfig> = {
  'Histórico Escolar': { prazo: '48 horas', descricao: 'O Histórico Escolar oficial consolida todas as disciplinas do curso, notas, cargas horárias e frequência. Emissão via PDF em até 48 horas.' },
  'Declaração IRPF': { prazo: '48 horas', descricao: 'A declaração financeira de Imposto de Renda fornece o relatório de todas as mensalidades quitadas no ano-calendário anterior para dedução fiscal de instrução escolar. Emissão em até 48 horas.' },
  'Transferência': { prazo: '3 dias úteis', descricao: 'A solicitação de transferência prepara a sua pasta acadêmica (incluindo guia de transferência e notas acumuladas) para submissão à outra instituição. Prazo regulamentar de 3 dias úteis.' }
};

const SecretariaPage: React.FC<SecretariaPageProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [tipoNovaSolicitacao, setTipoNovaSolicitacao] = useState<'Histórico Escolar' | 'Declaração IRPF' | 'Transferência'>('Histórico Escolar');
  const [prazos, setPrazos] = useState<Record<string, PrazoConfig>>(DEFAULT_PRAZOS);
  
  // Documentos de Identificação
  const [docTab, setDocTab] = useState<'carteirinha' | 'cracha'>('carteirinha');
  const [carteirinhaFormData, setCarteirinhaFormData] = useState<any>(null);
  const [crachaFormData, setCrachaFormData] = useState<any>(null);

  // Modais
  const [isBoletimOpen, setIsBoletimOpen] = useState(false);
  const [isDeclaracaoOpen, setIsDeclaracaoOpen] = useState(false);
  const [isIRPFOpen, setIsIRPFOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

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
  const hasTechnicalActiveMatricula = Boolean(activeTechnicalMatricula);
  const identityMatricula = hasTechnicalActiveMatricula ? activeTechnicalMatricula : null;
  const isTechnicalIdentityAvailable = hasTechnicalActiveMatricula;
  const activePoloId = activeMatricula?.turmas?.polo_id || activeMatricula?.polo_id;
  const { data: cardInstitutionalData } = usePoloInstitutionalData(activePoloId);
  const formattedMat = activeMatricula 
    ? formatMatricula(activeMatricula.id, activeMatricula.data_matricula, activeMatricula.polo_id) 
    : 'PENDENTE';
  const cardValidation = useDocumentValidationCode(
    identityMatricula
      ? {
          type: 'carteirinha',
          enrollmentId: identityMatricula.id,
        }
      : null,
    docTab === 'carteirinha'
  );
  const badgeValidation = useDocumentValidationCode(
    identityMatricula
      ? {
          type: 'cracha_estagio',
          enrollmentId: identityMatricula.id,
        }
      : null,
    docTab === 'cracha'
  );
  const enrollmentDeclarationValidation = useDocumentValidationCode(
    activeMatricula
      ? {
          type: 'declaracao_matricula',
          enrollmentId: activeMatricula.id,
        }
      : null,
    isDeclaracaoOpen
  );
  const irpfValidation = useDocumentValidationCode(
    identityMatricula
      ? {
          type: 'declaracao_irpf',
          enrollmentId: identityMatricula.id,
        }
      : null,
    isIRPFOpen
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

  // Busca pagamentos do aluno no ano anterior para IRPF
  const { data: irpfPayments = [] } = useQuery<any[]>({
    queryKey: ['secretaria-aluno-irpf-payments', alunoId],
    queryFn: async () => {
      const lastYear = new Date().getFullYear() - 1;
      const startDate = `${lastYear}-01-01`;
      const endDate = `${lastYear}-12-31`;
      
      const { data, error } = await supabase
        .from('contas_receber')
        .select('*')
        .eq('cliente_id', alunoId)
        .eq('status', 'PAGO')
        .gte('data_pagamento', startDate)
        .lte('data_pagamento', endDate);

      if (error) throw error;
      return data || [];
    }
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

  useEffect(() => {
    if (!isTechnicalIdentityAvailable && (docTab === 'carteirinha' || docTab === 'cracha')) {
      setDocTab('servicos' as any);
    }
  }, [isTechnicalIdentityAvailable, docTab]);

  useEffect(() => {
    if (!isTechnicalIdentityAvailable && tipoNovaSolicitacao !== 'Histórico Escolar') {
      setTipoNovaSolicitacao('Histórico Escolar');
    }
  }, [isTechnicalIdentityAvailable, tipoNovaSolicitacao]);

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
    const cursoNome = activeMatricula?.turmas?.cursos?.nome || '';
    const turmaNome = activeMatricula?.turmas?.nome || '';
    const poloNome = activeMatricula?.turmas?.polos?.nome || poloData?.nomeFantasia || '';
    const cidadePolo = poloData?.cidade || poloNome || 'Aracaju';

    const lastYear = new Date().getFullYear() - 1;
    const irpfTotalValue = irpfPayments.length > 0
      ? irpfPayments.reduce((acc, curr) => acc + Number(curr.valor_pago || curr.valor || 0), 0)
      : 3000.00;
    const irpfTotalExtenso = valorPorExtenso(irpfTotalValue);
    const formattedIrpfTotal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(irpfTotalValue);

    return text
      .replace(/\{\{ALUNO_NOME\}\}/g, alunoNome.toUpperCase())
      .replace(/\{ALUNO_NOME\}/g, alunoNome.toUpperCase())
      .replace(/\{\{ALUNO_CPF\}\}/g, aluno?.cpf || '')
      .replace(/\{ALUNO_CPF\}/g, aluno?.cpf || '')
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
      .replace(/\{\{VALIDADE_DIAS\}\}/g, String(vDays))
      .replace(/\{VALIDADE_DIAS\}/g, String(vDays))
      .replace(/\{\{VALIDADE_DATA\}\}/g, getValidadeData(vDays))
      .replace(/\{VALIDADE_DATA\}/g, getValidadeData(vDays))
      .replace(/\{\{ANO_CALENDARIO\}\}/g, String(lastYear))
      .replace(/\{ANO_CALENDARIO\}/g, String(lastYear))
      .replace(/\{\{VALOR_TOTAL\}\}/g, formattedIrpfTotal)
      .replace(/\{VALOR_TOTAL\}/g, formattedIrpfTotal)
      .replace(/\{\{VALOR_EXTENSO\}\}/g, irpfTotalExtenso)
      .replace(/\{VALOR_EXTENSO\}/g, irpfTotalExtenso);
  };

  // Carrega prazos, templates e solicitações do Supabase — NUNCA localStorage
  useEffect(() => {
    const loadData = async () => {
      // Prazos configurados pelo admin
      const prz = await secretariaService.getPrazos();
      setPrazos(prz);

      // Templates de cartões
      const savedCarteirinha = await carteirinhaService.getTemplate();
      if (savedCarteirinha) {
        setCarteirinhaFormData(savedCarteirinha);
      } else {
        setCarteirinhaFormData({ corPrimaria: '#001a33', corSecundaria: '#3b82f6', textoFrente: 'CIE - Documento do Estudante', textoVerso: 'Esta Carteirinha é de Responsabilidade do Portador,\nPara uso Pessoal e Intransferível.', tipoCurso: 'Técnico', exibirRotulos: true });
      }

      const savedCracha = await crachaService.getTemplate();
      if (savedCracha) {
        setCrachaFormData(savedCracha);
      } else {
        setCrachaFormData({ corPrimaria: '#001a33', corSecundaria: '#3b82f6', textoFrente: 'ALUNO', textoVerso: 'INSTRUÇÕES DE USO:\n1. Este crachá é de uso pessoal e obrigatório nas dependências da instituição.', cargoPadrao: 'ALUNO(A)', exibirRotulos: true });
      }

      // Solicitações do Supabase
      const sols = await secretariaService.getSolicitacoesByAluno(alunoId);
      setSolicitacoes(sols);
    };
    loadData();
  }, [alunoId]);

  const handleCriarSolicitacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aluno) return;

    const prazo = prazos[tipoNovaSolicitacao]?.prazo || (tipoNovaSolicitacao === 'Transferência' ? '3 dias úteis' : '48 horas');

    const newRequest = await secretariaService.createSolicitacao({
      alunoId,
      alunoNome: aluno.nome.toUpperCase(),
      alunoMatricula: formattedMat,
      curso: activeMatricula?.turmas?.cursos?.nome || 'CURSO GERAL',
      tipo: tipoNovaSolicitacao,
      dataSolicitacao: new Date().toISOString().split('T')[0],
      prazo,
      status: 'Pendente'
    });

    if (newRequest) {
      setSolicitacoes(prev => [newRequest, ...prev]);
      alert('Sua solicitação foi registrada! Aguarde o prazo regulamentar para recebimento.');
    } else {
      alert('Erro ao registrar solicitação. Tente novamente.');
    }
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

  if (loadingAluno || loadingMatriculas) {
    return (
      <div className="flex justify-center items-center py-20 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
        <Loader2 className="animate-spin text-blue-600 mr-2" size={24} />
        <span className="text-slate-500 font-bold uppercase tracking-widest text-xs">Carregando secretaria eletrônica...</span>
      </div>
    );
  }

  const qrCodeUrl = getDocumentValidationQrUrl(
    cardValidation.data?.code || formattedMat
  );

  // ── shared aluno data for ID docs ─────────────────────────────────────────
  const alunoData = {
    nome: aluno?.nome?.toUpperCase() || 'NOME DO ALUNO',
    cpf: aluno?.cpf || 'CPF não cadastrado',
    rg: aluno?.rg || 'Doc. não cadastrado',
    nascimento: aluno?.data_nascimento
      ? new Date(aluno.data_nascimento + 'T12:00:00').toLocaleDateString('pt-BR')
      : 'Não informado',
    matricula: formattedMat,
    curso: activeMatricula?.turmas?.cursos?.nome || 'CURSO GERAL',
    instituicao: cardInstitutionalData?.poloNome || 'UNIVERSO CURSOS E CONSULTORIA',
    validade: `01/${new Date().getFullYear() + 1}`,
    fotoUrl: aluno?.foto_url || null,
    tipoDocumento: aluno?.tipo_documento || 'RG',
    cargo: 'ALUNO(A)',
    polo: activeMatricula?.turmas?.polos?.nome || 'Polo Principal',
    poloRazaoSocial: cardInstitutionalData?.razaoSocial,
    poloCnpj: cardInstitutionalData?.cnpj,
    poloTelefone: cardInstitutionalData?.telefone,
  };

  const handleOpenIRPF = () => {
    if (!isTechnicalIdentityAvailable) {
      showToast(
        'A Declaração de Rendimentos (IRPF) só está disponível para matrícula ativa em curso técnico.',
        'warning'
      );
      return;
    }

    const dateLimit = irpfTemplateData?.liberacaoDate || '03-01';
    const [monthStr, dayStr] = dateLimit.split('-');
    const limitMonth = parseInt(monthStr, 10) || 3;
    const limitDay = parseInt(dayStr, 10) || 1;

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-indexed
    const currentDay = now.getDate();

    let isReleased = false;
    if (currentMonth > limitMonth) {
      isReleased = true;
    } else if (currentMonth === limitMonth && currentDay >= limitDay) {
      isReleased = true;
    }

    if (!isReleased) {
      const monthsList = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      const limitMonthName = monthsList[limitMonth - 1] || 'Março';
      showToast(`A Declaração de Rendimentos (IRPF) só estará disponível a partir de ${limitDay} de ${limitMonthName}.`, 'warning');
      return;
    }

    setIsIRPFOpen(true);
  };

  const printRegisteredDocument = (code: string | undefined, label: string) => {
    if (!code) {
      showToast(`Aguarde o registro do código da ${label}.`, 'warning');
      return;
    }
    window.print();
  };

  return (
    <div className="space-y-5 text-xs font-sans animate-fadeIn">

      {/* ── Welcome Banner ── */}
      <div className="bg-gradient-to-r from-blue-900 to-slate-900 p-5 sm:p-7 rounded-2xl text-white shadow-lg relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1 z-10">
          <span className="bg-blue-600/30 text-blue-300 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-blue-500/20">Secretaria Digital</span>
          <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Serviços Acadêmicos</h2>
          <p className="text-slate-300 font-medium text-xs">Emita declarações, faça solicitações e acesse seus documentos.</p>
        </div>
        <div className="bg-white/10 px-4 py-3 rounded-2xl border border-white/10 font-mono font-bold z-10 shrink-0">
          <p className="text-[9px] text-slate-400 font-sans font-black uppercase tracking-widest leading-none">Minha Matrícula</p>
          <p className="text-base text-white tracking-widest mt-1.5">{formattedMat}</p>
        </div>
      </div>

      {/* ── Top-level Tab Navigation ── */}
      <div className="flex gap-1 bg-white border border-slate-100 shadow-sm rounded-2xl p-1.5 overflow-x-auto">
        <button
          onClick={() => setDocTab('servicos' as any)}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all whitespace-nowrap ${
            (docTab as string) === 'servicos' || (docTab !== 'carteirinha' && docTab !== 'cracha')
              ? 'bg-[#001a33] text-white shadow-md'
              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
          }`}
        >
          <FileText size={13} /> Serviços
        </button>
        {isTechnicalIdentityAvailable && (
          <>
            <button
              onClick={() => setDocTab('carteirinha')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all whitespace-nowrap ${
                docTab === 'carteirinha'
                  ? 'bg-[#001a33] text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <CreditCard size={13} /> Carteirinha Digital
            </button>
            <button
              onClick={() => setDocTab('cracha')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all whitespace-nowrap ${
                docTab === 'cracha'
                  ? 'bg-[#001a33] text-white shadow-md'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <BadgeCheck size={13} /> Crachá de Identificação
            </button>
          </>
        )}
      </div>

      {/* ══════════════ SERVIÇOS TAB ══════════════ */}
      {(docTab as string) !== 'carteirinha' && (docTab as string) !== 'cracha' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left column: Quick docs + Requests table */}
            <div className="lg:col-span-2 space-y-5">
              {/* Quick Documents */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
                <div>
                  <h3 className="font-black text-[#001a33] text-sm uppercase tracking-tight">Emissão de Documentação Imediata</h3>
                  <p className="text-slate-500 font-medium mt-0.5">Clique para visualizar ou imprimir seus comprovantes oficiais.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setIsBoletimOpen(true)}
                    className="group p-5 bg-slate-50 hover:bg-[#001a33] hover:text-white rounded-2xl border border-slate-150 flex flex-col justify-between items-start text-left transition-all duration-300 min-h-[150px]"
                  >
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-white/10 group-hover:text-white transition-colors shadow-sm">
                      <ScrollText size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm group-hover:text-white transition-colors">Boletim Escolar</h4>
                      <p className="text-slate-500 font-medium text-[10px] leading-relaxed mt-1 group-hover:text-slate-400 transition-colors">Acompanhe suas notas parciais, médias finais e percentual de frequência.</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setIsDeclaracaoOpen(true)}
                    className="group p-5 bg-slate-50 hover:bg-[#001a33] hover:text-white rounded-2xl border border-slate-150 flex flex-col justify-between items-start text-left transition-all duration-300 min-h-[150px]"
                  >
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:bg-white/10 group-hover:text-white transition-colors shadow-sm">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm group-hover:text-white transition-colors">Declaração Cursando</h4>
                      <p className="text-slate-500 font-medium text-[10px] leading-relaxed mt-1 group-hover:text-slate-400 transition-colors">Comprovante de matrícula oficial ativo com autenticação por QR Code.</p>
                    </div>
                  </button>

                  {isTechnicalIdentityAvailable && (
                    <button
                      onClick={handleOpenIRPF}
                      className="group p-5 bg-slate-50 hover:bg-[#001a33] hover:text-white rounded-2xl border border-slate-150 flex flex-col justify-between items-start text-left transition-all duration-300 min-h-[150px]"
                    >
                      <div className="p-3 bg-teal-50 text-teal-600 rounded-xl group-hover:bg-white/10 group-hover:text-white transition-colors shadow-sm">
                        <DollarSign size={20} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm group-hover:text-white transition-colors">Comprovante IRPF</h4>
                        <p className="text-slate-500 font-medium text-[10px] leading-relaxed mt-1 group-hover:text-slate-400 transition-colors">Declaração financeira de mensalidades quitadas no ano-calendário anterior.</p>
                      </div>
                    </button>
                  )}
                </div>
                {!isTechnicalIdentityAvailable && (
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2 mt-4">
                    Carteirinha, crachá e Declaração de IRPF estão disponíveis apenas para matrícula ativa em curso técnico.
                  </p>
                )}
              </div>

              {/* Requests Table */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100">
                  <h3 className="font-black text-[#001a33] text-sm uppercase tracking-tight">Minhas Solicitações</h3>
                  <p className="text-slate-500 font-medium mt-0.5">Acompanhe o status e faça download das solicitações concluídas.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-black tracking-wider text-[9px] uppercase">
                        <th className="px-5 py-3">Documento</th>
                        <th className="px-5 py-3">Data Pedido</th>
                        <th className="px-5 py-3">Prazo</th>
                        <th className="px-5 py-3">Status</th>
                        <th className="px-5 py-3 text-right">Retorno / Link</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                      {solicitacoes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                            Nenhuma solicitação enviada até o momento.
                          </td>
                        </tr>
                      ) : (
                        solicitacoes.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5 font-bold text-[#001a33]">{item.tipo}</td>
                            <td className="px-5 py-3.5">{item.dataSolicitacao.split('-').reverse().join('/')}</td>
                            <td className="px-5 py-3.5">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded font-black text-[9px]">{item.prazo}</span>
                            </td>
                            <td className="px-5 py-3.5">{getStatusBadge(item.status)}</td>
                            <td className="px-5 py-3.5 text-right">
                              {item.status === 'Deferido' && item.resposta && (
                                item.resposta.startsWith('http') ? (
                                  <a href={item.resposta} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline font-bold text-[10px] uppercase tracking-wider">
                                    <Download size={12} /> Download
                                  </a>
                                ) : (
                                  <span className="text-slate-600 italic font-semibold text-[10px]" title={item.resposta}>Pronto</span>
                                )
                              )}
                              {item.status === 'Indeferido' && <span className="text-red-500 font-bold text-[10px]" title={item.resposta}>Recusado</span>}
                              {item.status === 'Pendente' && <span className="text-slate-400 font-bold">Em análise</span>}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right column: Request Form */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5 h-fit">
              <div>
                <h3 className="font-black text-[#001a33] text-sm uppercase tracking-tight">Nova Solicitação</h3>
                <p className="text-slate-500 font-medium mt-0.5">Abra um chamado acadêmico regulamentar.</p>
              </div>
              <form onSubmit={handleCriarSolicitacao} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Tipo de Documento</label>
                  <select
                    value={tipoNovaSolicitacao}
                    onChange={(e) => setTipoNovaSolicitacao(e.target.value as any)}
                    className="w-full p-3.5 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-blue-500 font-bold text-slate-700 cursor-pointer"
                  >
                    <option value="Histórico Escolar">Histórico Escolar (Prazo: {prazos['Histórico Escolar']?.prazo || '48h'})</option>
                    {isTechnicalIdentityAvailable && (
                      <>
                        <option value="Declaração IRPF">Declaração IRPF (Prazo: {prazos['Declaração IRPF']?.prazo || '48h'})</option>
                        <option value="Transferência">Transferência Escolar (Prazo: {prazos['Transferência']?.prazo || '3 dias úteis'})</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-150 space-y-1.5">
                  <h4 className="font-bold text-slate-700 uppercase tracking-wide text-[9px] flex items-center gap-1.5">
                    <HelpCircle size={12} className="text-slate-400" /> Detalhes Regulamentares
                  </h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-semibold">
                    {prazos[tipoNovaSolicitacao]?.descricao || ''}
                  </p>
                </div>
                <button
                  type="submit"
                  className="w-full py-4 bg-[#001a33] hover:bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <Send size={15} /> Enviar Solicitação
                </button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ══════════════ CARTEIRINHA TAB ══════════════ */}
      {docTab === 'carteirinha' && carteirinhaFormData && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-fadeIn">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-[#001a33] text-sm uppercase tracking-tight flex items-center gap-2">
                <CreditCard size={15} className="text-blue-600" /> Carteirinha de Estudante
              </h3>
              <p className="text-slate-500 text-xs font-medium mt-0.5">Frente e verso do seu documento oficial de identificação estudantil.</p>
            </div>
            <button
              onClick={() => printRegisteredDocument(cardValidation.data?.code, 'carteirinha')}
              className="flex items-center gap-2 px-4 py-2 bg-[#001a33] hover:bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-md"
            >
              <Download size={13} /> Baixar / Imprimir
            </button>
          </div>
          <div id="print-area" className="p-8 flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12">
            <div className="flex flex-col items-center gap-3">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">◆ Frente</span>
              <div className="shadow-xl rounded-2xl overflow-hidden ring-1 ring-slate-200">
                <CarteirinhaPreview formData={carteirinhaFormData} page="frente" zoomLevel={90} aluno={{ ...alunoData, validationCode: cardValidation.data?.code }} isEditable={false} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">◆ Verso</span>
              <div className="shadow-xl rounded-2xl overflow-hidden ring-1 ring-slate-200">
                <CarteirinhaPreview formData={carteirinhaFormData} page="verso" zoomLevel={90} aluno={{ ...alunoData, validationCode: cardValidation.data?.code }} isEditable={false} />
              </div>
            </div>
          </div>
          <div className="px-6 pb-5 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Carteirinha Estudantil Digital · Universo Cursos e Consultoria
            </p>
          </div>
        </div>
      )}

      {/* ══════════════ CRACHÁ TAB ══════════════ */}
      {docTab === 'cracha' && crachaFormData && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-fadeIn">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-black text-[#001a33] text-sm uppercase tracking-tight flex items-center gap-2">
                <BadgeCheck size={15} className="text-blue-600" /> Crachá de Identificação
              </h3>
              <p className="text-slate-500 text-xs font-medium mt-0.5">Frente e verso do seu crachá oficial para uso nas dependências da instituição.</p>
            </div>
            <button
              onClick={() => printRegisteredDocument(badgeValidation.data?.code, 'crachá')}
              className="flex items-center gap-2 px-4 py-2 bg-[#001a33] hover:bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-md"
            >
              <Download size={13} /> Baixar / Imprimir
            </button>
          </div>
          <div id="print-area-cracha" className="p-8 flex flex-col sm:flex-row items-start justify-center gap-8 sm:gap-12">
            <div className="flex flex-col items-center gap-3">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">◆ Frente</span>
              <div className="shadow-xl rounded-2xl overflow-hidden ring-1 ring-slate-200">
                <CrachaPreview formData={crachaFormData} page="frente" zoomLevel={90} aluno={{ nome: alunoData.nome, cpf: alunoData.cpf, rg: alunoData.rg, matricula: alunoData.matricula, cargo: alunoData.cargo, polo: alunoData.polo, fotoUrl: alunoData.fotoUrl, validationCode: badgeValidation.data?.code }} isEditable={false} />
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">◆ Verso</span>
              <div className="shadow-xl rounded-2xl overflow-hidden ring-1 ring-slate-200">
                <CrachaPreview formData={crachaFormData} page="verso" zoomLevel={90} aluno={{ nome: alunoData.nome, cpf: alunoData.cpf, rg: alunoData.rg, matricula: alunoData.matricula, cargo: alunoData.cargo, polo: alunoData.polo, fotoUrl: alunoData.fotoUrl, validationCode: badgeValidation.data?.code }} isEditable={false} />
              </div>
            </div>
          </div>
          <div className="px-6 pb-5 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Crachá de Identificação Digital · Universo Cursos e Consultoria
            </p>
          </div>
        </div>
      )}

      {/* ══════════════ BOLETIM MODAL ══════════════ */}
      {isBoletimOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <ScrollText className="text-blue-600" size={20} />
                <h4 className="font-black text-[#001a33] text-base uppercase tracking-tight">Boletim Informativo de Notas</h4>
              </div>
              <button onClick={() => setIsBoletimOpen(false)} className="p-2 bg-white border border-slate-250 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
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
                <tbody className="divide-y divide-slate-100">
                  {notas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        Nenhum lançamento de nota encontrado para esta turma.
                      </td>
                    </tr>
                  ) : (
                    notas.map((nota: any) => {
                      const p = parseFloat(nota.nota_prova) || 0;
                      const t = parseFloat(nota.nota_trabalho) || 0;
                      const q = parseFloat(nota.nota_qualitativa) || 0;
                      const media = parseFloat(nota.media_final) || ((p * 0.6) + (t * 0.3) + (q * 0.1));
                      const freq = parseFloat(nota.frequencia) || 0;
                      const aprovado = media >= 5 && freq >= 75;
                      return (
                        <tr key={nota.id} className="hover:bg-slate-50">
                          <td className="py-3 font-semibold text-slate-800">{nota.disciplinas?.nome || '—'}</td>
                          <td className="py-3 text-center font-bold">{nota.nota_prova ?? '—'}</td>
                          <td className="py-3 text-center font-bold">{nota.nota_trabalho ?? '—'}</td>
                          <td className="py-3 text-center font-bold">{nota.nota_qualitativa ?? '—'}</td>
                          <td className="py-3 text-center">
                            <span className={`font-black ${media >= 5 ? 'text-emerald-600' : 'text-rose-600'}`}>{media.toFixed(1)}</span>
                          </td>
                          <td className="py-3 text-center">
                            <span className={`font-black ${freq >= 75 ? 'text-emerald-600' : 'text-rose-600'}`}>{freq.toFixed(0)}%</span>
                          </td>
                          <td className="py-3 text-right">
                            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${aprovado ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                              {aprovado ? 'Aprovado' : 'Reprovado'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ DECLARAÇÃO MODAL ══════════════ */}
      {isDeclaracaoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-[858px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-emerald-600" size={20} />
                <h4 className="font-black text-[#001a33] text-base uppercase tracking-tight">Declaração de Cursando</h4>
              </div>
              <div className="flex gap-2">
                <button onClick={() => printRegisteredDocument(enrollmentDeclarationValidation.data?.code, 'declaração')} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#001a33] text-white hover:bg-blue-900 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors">
                  <Printer size={13} /> Imprimir
                </button>
                <button onClick={() => setIsDeclaracaoOpen(false)} className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm">
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="overflow-auto flex-1 bg-slate-100 flex justify-center p-8 custom-scrollbar">
              <div 
                id="print-area-declaracao"
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
                  <div dangerouslySetInnerHTML={{ __html: replaceVariables(templateData?.textContent || '') }} />
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
                      <span className="whitespace-pre-line">
                        {replaceVariables(field.value)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ IRPF MODAL ══════════════ */}
      {isIRPFOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] w-full max-w-[858px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="text-teal-650 text-teal-600" size={20} />
                <h4 className="font-black text-[#001a33] text-base uppercase tracking-tight">Declaração de Rendimentos (IRPF)</h4>
              </div>
              <div className="flex gap-2">
                <button onClick={() => printRegisteredDocument(irpfValidation.data?.code, 'declaração de IRPF')} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#001a33] text-white hover:bg-blue-900 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-colors">
                  <Printer size={13} /> Imprimir
                </button>
                <button onClick={() => setIsIRPFOpen(false)} className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm">
                  <X size={16} />
                </button>
              </div>
            </div>
            
            <div className="overflow-auto flex-1 bg-slate-100 flex justify-center p-8 custom-scrollbar">
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
                  <div dangerouslySetInnerHTML={{ __html: replaceVariables(irpfTemplateData?.textContent || '') }} />
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
                      <span className="whitespace-pre-line">
                        {replaceVariables(field.value)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] animate-fadeIn">
          <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all duration-300 ${
            toast.type === 'success' 
            ? 'bg-emerald-500/95 border-emerald-400 text-white' 
            : toast.type === 'warning'
            ? 'bg-amber-500/95 border-amber-400 text-white'
            : 'bg-red-500/95 border-red-400 text-white'
          }`}>
            {toast.type === 'success' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
            <span className="text-xs font-black uppercase tracking-wider">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Print styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area *, #print-area-cracha, #print-area-cracha *, #print-area-declaracao, #print-area-declaracao *, #print-area-irpf, #print-area-irpf * { visibility: visible; }
          #print-area, #print-area-cracha {
            position: absolute; left: 0; top: 0; width: 100%;
            padding: 20mm !important; box-shadow: none !important; border: none !important;
          }
          #print-area-declaracao, #print-area-irpf {
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

export default SecretariaPage;

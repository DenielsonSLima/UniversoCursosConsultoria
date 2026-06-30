import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import { CalendarDays, CheckCircle, Clock, Copy, CreditCard, ExternalLink, Filter, Search, TrendingUp, X, BadgeAlert, FileText, LayoutGrid, List, Download } from 'lucide-react';
import FinanceiroCardItem from './FinanceiroCardItem';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface FinanceiroPageProps {
  alunoId: string;
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ alunoId }) => {
  const [showPixModal, setShowPixModal] = useState<any | null>(null);
  const [showBoletoModal, setShowBoletoModal] = useState<any | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [isGeneratingReceiptPdf, setIsGeneratingReceiptPdf] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [modalityFilter, setModalityFilter] = useState<'TODOS' | 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO'>('TODOS');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [statusTab, setStatusTab] = useState<'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS'>('ABERTO');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;
  const receiptRef = useRef<HTMLDivElement>(null);

  // Fetch actual contas_receber from Supabase
  const { data: dbRecords = [], isLoading } = useQuery<any[]>({
    queryKey: ['aluno-financeiro', alunoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_receber')
        .select(`
          *,
          turmas!left(
            nome,
            cursos!left(
              modalidade,
              nome
            )
          ),
          parceiros!left(nome, cpf_cnpj)
        `)
        .eq('cliente_id', alunoId)
        .order('data_vencimento', { ascending: true });
      
      if (error) throw error;
      return data || [];
    }
  });

  const hiddenStatuses = ['CANCELADO', 'ESTORNADO'];
  const installments = dbRecords.filter((record) => !hiddenStatuses.includes(String(record.status || '').toUpperCase()));

  const getInstallmentModality = (inst: any) => {
    const turma = Array.isArray(inst.turmas) ? inst.turmas[0] : inst.turmas;
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    const rawModality = String(curso?.modalidade || '').toUpperCase();

    if (['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO'].includes(rawModality)) {
      return rawModality;
    }

    return 'OUTROS';
  };

  const getInstallmentCourseName = (inst: any) => {
    const turma = Array.isArray(inst.turmas) ? inst.turmas[0] : inst.turmas;
    const curso = turma && (Array.isArray(turma.cursos) ? turma.cursos[0] : turma.cursos);
    return curso?.nome || 'Sem curso vinculado';
  };

  const getRelatedPartner = (inst: any) =>
    Array.isArray(inst.parceiros) ? inst.parceiros[0] : inst.parceiros;

  const getInstallmentClassName = (modality: string) => {
    const palette = {
      EAD: 'bg-blue-50 text-blue-700 border-blue-100',
      TECNICO: 'bg-violet-50 text-violet-700 border-violet-100',
      LIVRE: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      ESPECIALIZACAO: 'bg-amber-50 text-amber-700 border-amber-100',
      OUTROS: 'bg-slate-50 text-slate-700 border-slate-100'
    };

    return `${palette[modality as keyof typeof palette] || palette.OUTROS}`;
  };

  const parseDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const installmentRows = installments.map((inst) => {
    const modality = getInstallmentModality(inst);
    const dueDate = parseDate(inst.data_vencimento);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = String(inst.status || '').toUpperCase() === 'VENCIDO' || (String(inst.status || '').toUpperCase() === 'PENDENTE' && Boolean(dueDate) && dueDate < today);
    return {
      ...inst,
      modalidade: modality,
      cursoNome: getInstallmentCourseName(inst),
      turmaNome: (Array.isArray(inst.turmas) ? inst.turmas[0] : inst.turmas)?.nome || 'N/A',
      isOverdue
    };
  });

  const filteredBySearchDateModality = installmentRows.filter((inst) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch = !normalizedSearch || [
      inst.descricao,
      inst.cursoNome,
      inst.turmaNome,
      inst.status,
      inst.forma_pagamento
    ].some((item) => String(item || '').toLowerCase().includes(normalizedSearch));

    const dueDate = parseDate(inst.data_vencimento);
    const start = startDate ? parseDate(startDate) : null;
    const end = endDate ? parseDate(endDate) : null;
    const matchesDate = (() => {
      if (!dueDate) return true;
      if (start && dueDate < start) return false;
      if (end && dueDate > end) return false;
      return true;
    })();

    const matchesModality = modalityFilter === 'TODOS' ? true : inst.modalidade === modalityFilter;

    return matchesSearch && matchesDate && matchesModality;
  });

  const tabCounts = {
    ABERTO: filteredBySearchDateModality.filter((inst) => String(inst.status || '').toUpperCase() === 'PENDENTE' && !inst.isOverdue).length,
    ATRASADO: filteredBySearchDateModality.filter((inst) => inst.isOverdue).length,
    PAGO: filteredBySearchDateModality.filter((inst) => String(inst.status || '').toUpperCase() === 'PAGO').length,
    TODOS: filteredBySearchDateModality.length
  };

  const filteredInstallments = filteredBySearchDateModality.filter((inst) => {
    const status = String(inst.status || '').toUpperCase();
    const matchesStatus = (() => {
      if (statusTab === 'ABERTO') return status === 'PENDENTE' && !inst.isOverdue;
      if (statusTab === 'ATRASADO') return inst.isOverdue;
      if (statusTab === 'PAGO') return status === 'PAGO';
      return true;
    })();

    return matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, modalityFilter, statusTab, viewMode]);

  useEffect(() => {
    const hasOpenModal = Boolean(showPixModal || showBoletoModal || selectedReceipt);
    if (!hasOpenModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedReceipt) closeReceipt();
        if (showPixModal) setShowPixModal(null);
        if (showBoletoModal) setShowBoletoModal(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPixModal, showBoletoModal, selectedReceipt]);

  const totalPages = Math.max(1, Math.ceil(filteredInstallments.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const pageOffset = (currentPageSafe - 1) * pageSize;
  const visibleInstallments = filteredInstallments.slice(pageOffset, pageOffset + pageSize);
  const groupedVisibleInstallments = visibleInstallments.reduce<Record<string, any[]>>((acc, inst) => {
    const modality = inst.modalidade || 'OUTROS';
    if (!acc[modality]) acc[modality] = [];
    acc[modality].push(inst);
    return acc;
  }, {});
  const modalityOrder: string[] = ['EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS'];

  const safeSetPage = (page: number) => {
    if (page < 1) return;
    if (page > totalPages) return;
    setCurrentPage(page);
  };

  // Calculations
  const totalPaid = installments
    .filter(i => i.status === 'PAGO')
    .reduce((acc, i) => acc + Number(i.valor), 0);

  const totalPending = installments
    .filter(i => i.status === 'PENDENTE' || i.status === 'VENCIDO')
    .reduce((acc, i) => acc + Number(i.valor), 0);

  const handleCopyPix = (key: string) => {
    navigator.clipboard.writeText(key);
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 2000);
  };

  const copyPaymentLink = async (url?: string | null) => {
    if (!url) {
      setNotice('Esta cobrança ainda não possui link de pagamento. Fale com a secretaria para reenviar a cobrança.');
      return;
    }
    await navigator.clipboard.writeText(url);
    setNotice('Link de pagamento copiado.');
    setTimeout(() => setNotice(''), 2500);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const isPaidThroughAsaas = (inst: any) => {
    const status = String(inst.status || '').toUpperCase();
    const asaasStatus = String(inst.asaas_status || '').toUpperCase();
    return status === 'PAGO' && (
      String(inst.origem_pagamento || '').toUpperCase() === 'ASAAS'
      || ['RECEIVED', 'CONFIRMED'].includes(asaasStatus)
      || Boolean(inst.asaas_transaction_receipt_url)
    );
  };

  const getPaidReceiptLabel = (inst: any) =>
    isPaidThroughAsaas(inst) ? 'Comprovante Asaas' : 'Recibo Universo';

  const openReceipt = (inst: any) => {
    if (String(inst.status || '').toUpperCase() !== 'PAGO') {
      setNotice('O recibo fica disponível somente para cobranças pagas.');
      return;
    }

    if (isPaidThroughAsaas(inst)) {
      if (inst.asaas_transaction_receipt_url) {
        window.open(inst.asaas_transaction_receipt_url, '_blank', 'noopener,noreferrer');
        return;
      }
      setNotice('O comprovante oficial do Asaas ainda não foi retornado. Aguarde a atualização do pagamento ou fale com a secretaria.');
      setTimeout(() => setNotice(''), 4500);
      return;
    }

    setSelectedReceipt(inst);
  };

  const closeReceipt = () => {
    setSelectedReceipt(null);
  };

  const downloadReceiptPdf = async () => {
    if (!selectedReceipt || !receiptRef.current) return;
    const originalNotice = notice;
    setIsGeneratingReceiptPdf(true);

    try {
      const canvas = await html2canvas(receiptRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 190;
      const pageHeight = 277;
      const ratio = imgWidth / canvas.width;
      let remainingHeight = canvas.height;
      const pagePixelHeight = pageHeight / ratio;
      let position = 0;
      let pageIndex = 0;

      while (remainingHeight > 0) {
        const sliceHeight = Math.min(pagePixelHeight, remainingHeight);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeight;
        const ctx = sliceCanvas.getContext('2d');

        if (!ctx) {
          throw new Error('Não foi possível preparar o canvas do recibo.');
        }

        ctx.drawImage(
          canvas,
          0,
          position,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight
        );

        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceHeightMm = sliceHeight * ratio;

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(sliceData, 'PNG', 10, 10, imgWidth, sliceHeightMm);
        remainingHeight -= sliceHeight;
        position += sliceHeight;
        pageIndex += 1;
      }

      const fileName = `recibo-${String(selectedReceipt.id || '').slice(0, 8).toUpperCase() || 'PAGO'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
      setNotice('Recibo baixado com sucesso.');
      setTimeout(() => setNotice(originalNotice), 2000);
    } catch {
      setNotice('Não foi possível gerar o PDF do recibo. Tente novamente.');
      setTimeout(() => setNotice(''), 2000);
    } finally {
      setIsGeneratingReceiptPdf(false);
    }
  };

  const getReceiptPayload = (inst: any) => {
    const receiptNumber = String(inst?.id || '').slice(0, 8).toUpperCase() || 'RECIBO';
    const parceiro = getRelatedPartner(inst);
    const payerName = parceiro?.nome || 'Aluno';
    const payerDocument = parceiro?.cpf_cnpj || '';
    const courseName = inst?.cursoNome || getInstallmentCourseName(inst);
    const turmaNome = inst?.turmaNome || 'N/A';
    return {
      receiptNumber,
      paidAt: formatDate(inst?.data_pagamento || inst?.updated_at || inst?.data_vencimento),
      paymentMethod: inst?.forma_pagamento || inst?.origem_pagamento || 'Pagamento confirmado',
      dueDate: formatDate(inst?.data_vencimento),
      description: inst?.descricao || 'Recibo de pagamento',
      paidValue: formatCurrency(Number(inst?.valor_pago || inst?.valor || 0)),
      status: String(inst?.status || 'PAGO').toUpperCase(),
      courseName,
      turmaNome,
      payerName,
      payerDocument,
      enrollment: inst?.turma_id || 'Sem vínculo',
      generatedAt: formatDate(new Date().toISOString().slice(0, 10))
    };
  };

  const receiptPayload = selectedReceipt ? getReceiptPayload(selectedReceipt) : null;

  const getInstallmentStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'PAGO':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
            <CheckCircle size={10} /> Pago
          </span>
        );
      case 'PENDENTE':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
            <Clock size={10} /> Pendente
          </span>
        );
      case 'VENCIDO':
        return (
          <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-red-100">
            <BadgeAlert size={10} /> Vencido
          </span>
        );
      case 'SUSPENSO':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-blue-100">
            <Clock size={10} /> Suspenso
          </span>
        );
      default:
        return null;
    }
  };

  const getModalityLabel = (modality: string) => {
    const map: Record<string, string> = {
      EAD: 'EAD',
      TECNICO: 'Técnico',
      LIVRE: 'Livre',
      ESPECIALIZACAO: 'Especialização',
      OUTROS: 'Outros'
    };

    return map[modality] || 'Outros';
  };

  const renderActions = (inst: any) => {
    if (['PENDENTE', 'VENCIDO'].includes(inst.status)) {
      if (inst.asaas_invoice_url) {
        return (
          <div className="flex justify-start gap-2">
            <a
              href={inst.asaas_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
            >
              <ExternalLink size={12} /> Pagar agora
            </a>
            <button
              onClick={() => copyPaymentLink(inst.asaas_invoice_url)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
            >
              Copiar link
            </button>
          </div>
        );
      }

      return (
        <div className="flex justify-start gap-2">
          <button
            onClick={() => setShowPixModal(inst)}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
          >
            Pagar Pix
          </button>
          <button
            onClick={() => setShowBoletoModal(inst)}
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
          >
            Boleto
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => openReceipt(inst)}
        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
      >
        {getPaidReceiptLabel(inst)}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Panel */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="text-blue-600" />
            Financeiro Acadêmico
          </h2>
          <p className="text-xs text-slate-450 font-medium">Gerencie suas mensalidades, boletos e pagamentos via PIX</p>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Pago</p>
            <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalPaid)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Lançamentos compensados</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">A pagar / Aberto</p>
            <p className="text-2xl font-black text-[#001a33]">{formatCurrency(totalPending)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Mensalidades futuras e pendentes</p>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* Filter + List + Views */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <FileText size={16} className="text-blue-500" />
          <h3 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Histórico de Cobranças</h3>
        </div>

        {notice && (
          <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-700">
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><Search size={12} /> Buscar</span>
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descrição, curso ou status"
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data inicial</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data final</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><Filter size={12} /> Tipo</span>
            </label>
            <select
              value={modalityFilter}
              onChange={(e) => setModalityFilter(e.target.value as 'TODOS' | 'EAD' | 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO')}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-bold text-slate-700"
            >
              <option value="TODOS">Todos os tipos</option>
              <option value="EAD">EAD</option>
              <option value="TECNICO">Técnico</option>
              <option value="LIVRE">Livre</option>
              <option value="ESPECIALIZACAO">Especialização</option>
            </select>
          </div>

          <div>
            <label className="sr-only">Visualização</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                title="Visualização em tabela"
                onClick={() => setViewMode('table')}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center ${
                  viewMode === 'table'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                <List size={16} />
              </button>
              <button
                title="Visualização em cards"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center ${
                  viewMode === 'cards'
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-slate-50 text-slate-600 border border-slate-200'
                }`}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4 mt-4">
          {[
            { key: 'ABERTO', label: 'Em aberto', count: tabCounts.ABERTO },
            { key: 'ATRASADO', label: 'Atrasado', count: tabCounts.ATRASADO },
            { key: 'PAGO', label: 'Pagos', count: tabCounts.PAGO },
            { key: 'TODOS', label: 'Todos', count: tabCounts.TODOS }
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key as 'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS')}
              className={`px-3 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${
                statusTab === tab.key
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {tab.label}
                <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[9px] font-black">{tab.count}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500 font-bold">
          <span>
            Exibindo <strong className="font-black">{filteredInstallments.length}</strong> cobranças
            {filteredInstallments.length !== installments.length && (
              <span> de <strong className="font-black">{installments.length}</strong> no total</span>
            )}
          </span>
          {modalityFilter !== 'TODOS' && <span className="uppercase text-blue-600">Tipo: {getModalityLabel(modalityFilter)}</span>}
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs font-medium text-slate-500">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                  <th className="py-4 px-4">Descrição</th>
                  <th className="py-4 px-4">Tipo</th>
                  <th className="py-4 px-4">Vencimento</th>
                  <th className="py-4 px-4">Valor</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4">Pagamento</th>
                  <th className="py-4 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleInstallments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-xs font-bold text-slate-400">
                      Nenhuma cobrança encontrada com os filtros atuais.
                    </td>
                  </tr>
                ) : visibleInstallments.map((inst) => (
                  <tr key={inst.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4.5 px-4 font-bold text-slate-800">{inst.descricao}</td>
                    <td className="py-4.5 px-4">
                      <span className={`inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${getInstallmentClassName(inst.modalidade)}`}>
                        {getModalityLabel(inst.modalidade)}
                      </span>
                    </td>
                    <td className="py-4.5 px-4">{formatDate(inst.data_vencimento)}</td>
                    <td className="py-4.5 px-4 font-bold text-[#001a33]">{formatCurrency(inst.valor)}</td>
                    <td className="py-4.5 px-4">{getInstallmentStatusBadge(inst.status)}</td>
                    <td className="py-4.5 px-4">
                      {inst.status === 'PAGO' ? (
                        <span className="text-[10px] font-bold text-slate-650 bg-slate-100 px-2 py-0.5 rounded">
                          {formatDate(inst.data_pagamento)} via {inst.forma_pagamento || 'Pix'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold">—</span>
                      )}
                    </td>
                    <td className="py-4.5 px-4 text-right">{renderActions(inst)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {visibleInstallments.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs font-bold text-slate-400">
                Nenhuma cobrança encontrada com os filtros atuais.
              </div>
            ) : modalityOrder.map((modality) => {
              const installmentsByModality = groupedVisibleInstallments[modality] || [];
              if (installmentsByModality.length === 0) return null;

              return (
                <div key={modality} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">
                      {getModalityLabel(modality)}
                    </h4>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                      {installmentsByModality.length} item{installmentsByModality.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {installmentsByModality.map((inst) => (
                      <FinanceiroCardItem
                        key={inst.id}
                        installment={inst}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        getModalityLabel={getModalityLabel}
                        getModalityClassName={getInstallmentClassName}
                        getInstallmentStatusBadge={getInstallmentStatusBadge}
                        onCopyLink={copyPaymentLink}
                        onOpenReceipt={openReceipt}
                        onOpenPix={setShowPixModal}
                        onOpenBoleto={setShowBoletoModal}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[11px] text-slate-500 font-bold">
            Página {currentPageSafe} de {totalPages}
          </p>
          <div className="inline-flex items-center gap-2">
            <button
              onClick={() => safeSetPage(currentPageSafe - 1)}
              disabled={currentPageSafe === 1}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              onClick={() => safeSetPage(currentPageSafe + 1)}
              disabled={currentPageSafe === totalPages}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* PIX Modal Overlay */}
      {showPixModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto flex items-center justify-center p-4 overflow-y-auto min-h-screen"
          onClick={() => setShowPixModal(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl relative animate-fadeIn flex flex-col items-center text-center"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button 
              onClick={() => setShowPixModal(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <CreditCard size={24} />
            </div>

            <h4 className="text-base font-bold text-[#001a33] uppercase tracking-tight">Pagar via PIX</h4>
            <p className="text-slate-500 text-xs mt-1">Escaneie o QR Code abaixo ou copie a chave Pix Copia e Cola para realizar o pagamento.</p>

            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-150 my-6 flex justify-center items-center">
              {/* Fake QR code representation */}
              <div className="w-40 h-40 bg-white border border-slate-200 p-2 flex flex-col justify-center items-center">
                <div className="grid grid-cols-4 gap-1 w-full h-full opacity-70">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={`rounded-sm ${i % 3 === 0 || i % 7 === 0 ? 'bg-[#001a33]' : 'bg-transparent'}`} />
                  ))}
                </div>
              </div>
            </div>

            <div className="w-full space-y-4">
              <div className="text-left bg-slate-50 p-3 rounded-xl border border-slate-150 flex justify-between items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] uppercase text-slate-400 font-bold">Chave Pix Copia e Cola</p>
                  <p className="text-[10px] text-slate-750 font-bold truncate">00020126580014br.gov.bcb.pix0136kfekgwyqozhicpfuunpo.universo</p>
                </div>
                <button 
                  onClick={() => handleCopyPix('00020126580014br.gov.bcb.pix0136kfekgwyqozhicpfuunpo.universo')}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg shrink-0 transition-colors"
                >
                  <Copy size={16} />
                </button>
              </div>

              {pixCopied && (
                <p className="text-[10px] text-emerald-600 font-black uppercase tracking-wider">Chave Pix Copiada!</p>
              )}

              <button 
                onClick={() => {
                  setNotice('Pagamento enviado para conferência. A baixa oficial acontece após confirmação do Asaas.');
                  setShowPixModal(null);
                }}
                className="w-full py-3 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md"
              >
                Confirmar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOLETO Modal Overlay */}
      {showBoletoModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto flex items-center justify-center p-4 overflow-y-auto min-h-screen"
          onClick={() => setShowBoletoModal(null)}
        >
          <div
            className="bg-white rounded-[2.5rem] p-8 max-w-xl w-full border border-slate-100 shadow-2xl relative animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button 
              onClick={() => setShowBoletoModal(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-slate-50 text-slate-650 rounded-xl flex items-center justify-center">
                <FileText size={20} />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#001a33] uppercase tracking-tight">Boleto Bancário</h4>
                <p className="text-[10px] text-slate-450 uppercase font-black tracking-widest">{showBoletoModal.descricao}</p>
              </div>
            </div>

            {/* Fake Bank Slip styling */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden text-[10px] text-slate-600 bg-white font-mono shadow-sm">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-xs border-r border-slate-300 pr-2">341-7</span>
                  <span className="font-black text-[11px]">BANCO UNIVERSO S.A.</span>
                </div>
                <span className="font-bold text-[9px] text-slate-500">34191.79001 01043.513184 91020.150008 7 98120000025000</span>
              </div>

              <div className="grid grid-cols-4 border-b border-slate-200">
                <div className="col-span-3 border-r border-slate-250 p-3">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Local de Pagamento</p>
                  <p className="font-bold text-slate-850 font-sans mt-0.5">QUALQUER BANCO OU CORRESPONDENTE BANCÁRIO ATÉ O VENCIMENTO</p>
                </div>
                <div className="p-3 bg-slate-50/50">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Vencimento</p>
                  <p className="font-bold text-slate-850 text-xs mt-0.5">{formatDate(showBoletoModal.data_vencimento)}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 border-b border-slate-200">
                <div className="col-span-3 border-r border-slate-250 p-3">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Cedente / Beneficiário</p>
                  <p className="font-bold text-slate-850 font-sans mt-0.5">UNIVERSO CURSOS E CONSULTORIA LTDA - CNPJ: 26.111.450/0001-33</p>
                </div>
                <div className="p-3 bg-slate-50/50">
                  <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Valor da Cobrança</p>
                  <p className="font-bold text-slate-850 text-xs mt-0.5">{formatCurrency(showBoletoModal.valor)}</p>
                </div>
              </div>

              <div className="p-3 border-b border-slate-200">
                <p className="text-[8px] font-sans font-bold text-slate-400 uppercase">Instruções de Responsabilidade do Beneficiário</p>
                <p className="font-medium font-sans leading-relaxed text-[9px] mt-1">
                  * APÓS O VENCIMENTO COBRAR MULTA DE 2.0% E JUROS DE 1% AO MÊS.<br />
                  * NÃO RECEBER APÓS 30 DIAS DO VENCIMENTO.<br />
                  * QUALQUER DÚVIDA ENTRAR EM CONTATO COM O POLO DE MATRÍCULA.
                </p>
              </div>

              <div className="p-4 flex flex-col items-center gap-2 bg-slate-50">
                {/* Fake Barcode representation */}
                <div className="h-10 bg-slate-900 w-full flex items-center justify-between opacity-80 rounded-sm">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div key={i} className="h-full bg-black" style={{ width: `${i % 3 === 0 ? '1px' : i % 5 === 0 ? '3px' : '2px'}` }} />
                  ))}
                </div>
                <p className="text-[8px] tracking-[0.2em] font-sans font-bold text-slate-400 uppercase">Código de barras para leitura</p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setShowBoletoModal(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button 
                onClick={() => {
                  setNotice('Quando o Asaas retornar o PDF do boleto, ele ficará disponível neste botão.');
                  setShowBoletoModal(null);
                }}
                className="px-5 py-2.5 bg-[#001a33] hover:bg-blue-900 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-md"
              >
                Baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recibo Modal Overlay */}
      {selectedReceipt && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto flex items-center justify-center p-4 overflow-y-auto min-h-screen"
          onClick={closeReceipt}
        >
          <div
            className="bg-white rounded-[1.75rem] p-5 sm:p-6 max-w-2xl w-full border border-slate-100 shadow-2xl relative animate-fadeIn overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={closeReceipt}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col gap-2 mb-6">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Universo Cursos e Consultoria</p>
              <h4 className="text-xl font-black text-[#001a33]">Recibo de pagamento</h4>
              <p className="text-[10px] text-slate-500 font-medium">
                Recibo institucional para pagamentos recebidos manualmente.
              </p>
            </div>

            <div
              ref={receiptRef}
              className="rounded-2xl border border-slate-200 bg-white p-6 print-area"
            >
              <div className="flex flex-col gap-4 border-b-2 border-[#001a33] pb-5 md:flex-row md:justify-between">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Universo Cursos e Consultoria</h1>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500">Documento financeiro emitido pelo Portal do Aluno</p>
                </div>
                <div className="text-right">
                  <span className="inline-block rounded-lg bg-[#001a33] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white">
                    Recibo de Pagamento
                  </span>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{receiptPayload?.receiptNumber}</p>
                </div>
              </div>

              <div className="my-6 rounded-2xl border-2 border-[#001a33] bg-slate-50 p-6 text-center">
                <p className="text-4xl font-black text-[#001a33]">{receiptPayload?.paidValue}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">Valor recebido</p>
              </div>

              <div className="rounded-xl bg-slate-50 p-4">
                <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-slate-400">Descrição</p>
                <p className="text-sm font-semibold leading-relaxed text-slate-800">{receiptPayload?.description}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {receiptPayload?.courseName} • Turma: {receiptPayload?.turmaNome}
                </p>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {[
                  { label: 'Aluno / Pagador', value: receiptPayload?.payerName },
                  { label: 'CPF/CNPJ', value: receiptPayload?.payerDocument || 'Não informado' },
                  { label: 'Data de vencimento', value: receiptPayload?.dueDate || '—' },
                  { label: 'Data de pagamento', value: receiptPayload?.paidAt },
                  { label: 'Forma de pagamento', value: receiptPayload?.paymentMethod },
                  { label: 'Status', value: receiptPayload?.status },
                ].map((field) => (
                  <div key={field.label}>
                    <p className="mb-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{field.label}</p>
                    <p className="text-sm font-semibold text-slate-700">{field.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-end justify-between border-t border-dashed border-slate-300 pt-5">
                <p className="text-[10px] font-semibold text-slate-400">Gerado em {receiptPayload?.generatedAt}</p>
                <div className="text-center">
                  <div className="mx-auto mb-2 w-40 border-t border-slate-800" />
                  <p className="text-xs font-semibold text-slate-600">Universo Cursos e Consultoria</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={closeReceipt}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={downloadReceiptPdf}
                disabled={isGeneratingReceiptPdf}
                className={`px-4 py-2.5 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-colors shadow-md inline-flex items-center gap-2 justify-center ${
                  isGeneratingReceiptPdf
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Download size={16} />
                {isGeneratingReceiptPdf ? 'Gerando PDF...' : 'Baixar PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default FinanceiroPage;

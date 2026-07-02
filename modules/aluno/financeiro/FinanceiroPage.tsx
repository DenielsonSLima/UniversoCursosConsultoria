import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { CalendarDays, CheckCircle, Clock, CreditCard, ExternalLink, Filter, Search, TrendingUp, X, BadgeAlert, FileText, LayoutGrid, List, Download } from 'lucide-react';
import FinanceiroCardItem from './FinanceiroCardItem';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import ReciboDespesaPreview, { ReciboData } from '../../gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPreview';

interface FinanceiroPageProps {
  alunoId: string;
}

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ alunoId }) => {
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);
  const [asaasReceiptPreview, setAsaasReceiptPreview] = useState<{ url: string; title: string } | null>(null);
  const [isGeneratingReceiptPdf, setIsGeneratingReceiptPdf] = useState(false);
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
    const hasOpenModal = Boolean(selectedReceipt || asaasReceiptPreview);
    if (!hasOpenModal) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedReceipt) closeReceipt();
        if (asaasReceiptPreview) closeAsaasReceiptPreview();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedReceipt, asaasReceiptPreview]);

  useEffect(() => {
    const hasOpenOverlay = Boolean(selectedReceipt || asaasReceiptPreview);
    if (!hasOpenOverlay) return;

    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
    };
  }, [selectedReceipt, asaasReceiptPreview]);

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

  const formatPaymentMethod = (method?: string | null) => {
    const normalized = String(method || '').trim();
    return normalized || 'Forma não informada';
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
    isPaidThroughAsaas(inst) ? 'Comprovante' : 'Recibo Universo';

  const openReceipt = (inst: any) => {
    if (String(inst.status || '').toUpperCase() !== 'PAGO') {
      setNotice('O recibo fica disponível somente para cobranças pagas.');
      return;
    }

    if (isPaidThroughAsaas(inst)) {
      const receiptUrl = inst.asaas_transaction_receipt_url;
      if (receiptUrl) {
        setAsaasReceiptPreview({
          url: receiptUrl,
          title: inst.descricao || 'Comprovante',
        });
        return;
      }
      setNotice('O comprovante ainda não foi retornado. Aguarde a atualização do pagamento ou fale com a secretaria.');
      setTimeout(() => setNotice(''), 4500);
      return;
    }

    setSelectedReceipt(inst);
  };

  const closeReceipt = () => {
    setSelectedReceipt(null);
  };

  const closeAsaasReceiptPreview = () => {
    setAsaasReceiptPreview(null);
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

  const getReceiptPayload = (inst: any): ReciboData => {
    const receiptNumber = String(inst?.id || '').slice(0, 8).toUpperCase() || 'RECIBO';
    const parceiro = getRelatedPartner(inst);
    const payerName = parceiro?.nome || 'Aluno';
    const payerDocument = parceiro?.cpf_cnpj || '';
    const courseName = inst?.cursoNome || getInstallmentCourseName(inst);
    const turmaNome = inst?.turmaNome || 'N/A';
    return {
      reciboTitulo: 'Recibo de Pagamento',
      reciboNumero: receiptNumber,
      contraparteLabel: 'Aluno / Pagador',
      assinaturaNome: 'Universo Cursos e Consultoria',
      empresaNome: 'Universo Cursos e Consultoria',
      descricao: inst?.descricao || 'Recibo de pagamento',
      valor: Number(inst?.valor || 0),
      valorPago: Number(inst?.valor_pago || inst?.valor || 0),
      dataVencimento: inst?.data_vencimento || new Date().toISOString().slice(0, 10),
      dataPagamento: inst?.data_pagamento || String(inst?.updated_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      fornecedorNome: payerName,
      fornecedorId: payerDocument,
      categoriaNome: courseName ? `${courseName}${turmaNome && turmaNome !== 'N/A' ? ` - Turma ${turmaNome}` : ''}` : undefined,
      formaPagamento: inst?.forma_pagamento || inst?.origem_pagamento || 'Recebimento manual',
      status: String(inst?.status || 'PAGO').toUpperCase(),
      observacao: 'Recibo interno emitido para pagamento registrado manualmente no financeiro.'
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
        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-slate-100">
          <Clock size={12} /> Cobrança em emissão
        </span>
      );
    }

    if (String(inst.status || '').toUpperCase() === 'PAGO') {
      return (
        <button
          onClick={() => openReceipt(inst)}
          className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
        >
          {getPaidReceiptLabel(inst)}
        </button>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider rounded-lg border border-slate-100">
        Sem comprovante
      </span>
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
          <p className="text-xs text-slate-450 font-medium">Gerencie suas mensalidades e comprovantes oficiais</p>
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
                          {formatDate(inst.data_pagamento)} via {formatPaymentMethod(inst.forma_pagamento)}
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

      {/* Comprovante Fullscreen Preview */}
      {asaasReceiptPreview && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed left-0 top-0 right-0 bottom-0 z-[10000] h-dvh w-screen overflow-hidden bg-slate-950 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Prévia do comprovante"
        >
          <div className="flex h-full w-full flex-col">
            <div className="flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300">Comprovante</p>
                <h4 className="truncate text-sm font-black uppercase tracking-tight text-white sm:text-base">
                  {asaasReceiptPreview.title}
                </h4>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={asaasReceiptPreview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition-colors hover:bg-white/15"
                >
                  <ExternalLink size={14} />
                  Abrir fora
                </a>
                <button
                  type="button"
                  onClick={closeAsaasReceiptPreview}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
                  title="Fechar comprovante"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-900">
              <iframe
                src={asaasReceiptPreview.url}
                title="Prévia do comprovante"
                className="h-full w-full border-0 bg-white"
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Recibo Modal Overlay */}
      {selectedReceipt && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed left-0 top-0 right-0 bottom-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto flex h-dvh w-screen items-center justify-center p-4 overflow-y-auto"
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

            <div
              ref={receiptRef}
              className="print-area"
            >
              <ReciboDespesaPreview data={receiptPayload || undefined} />
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
        </div>,
        document.body,
      )}

    </div>
  );
};

export default FinanceiroPage;

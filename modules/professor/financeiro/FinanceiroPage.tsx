import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../lib/supabase';
import {
  BadgeAlert,
  CalendarDays,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileText,
  Filter,
  LayoutGrid,
  List,
  ReceiptText,
  Search,
  TrendingUp,
  WalletCards,
  X
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface FinanceiroPageProps {
  professorId: string;
}

type StatusTab = 'ABERTO' | 'ATRASADO' | 'PAGO' | 'TODOS';
type ViewMode = 'cards' | 'table';

interface ProfessorPayment {
  id: string;
  descricao?: string | null;
  categoria?: string | null;
  valor?: number | string | null;
  valor_pago?: number | string | null;
  data_vencimento?: string | null;
  data_pagamento?: string | null;
  status?: string | null;
  forma_pagamento?: string | null;
  observacao?: string | null;
  created_at?: string | null;
  polos?: {
    nome?: string | null;
    cidade?: string | null;
    estado?: string | null;
  } | null;
  isOverdue?: boolean;
}

const hiddenStatuses = ['CANCELADO', 'ESTORNADO'];
const pageSize = 8;

const FinanceiroPage: React.FC<FinanceiroPageProps> = ({ professorId }) => {
  const [selectedReceipt, setSelectedReceipt] = useState<ProfessorPayment | null>(null);
  const [isGeneratingReceiptPdf, setIsGeneratingReceiptPdf] = useState(false);
  const [notice, setNotice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('TODOS');
  const [statusTab, setStatusTab] = useState<StatusTab>('ABERTO');
  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [currentPage, setCurrentPage] = useState(1);
  const receiptRef = useRef<HTMLDivElement>(null);

  const { data: dbPayments = [], isLoading } = useQuery<ProfessorPayment[]>({
    queryKey: ['professor-financeiro', professorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contas_pagar')
        .select('*, polos(nome, cidade, estado)')
        .eq('fornecedor_id', professorId)
        .order('data_vencimento', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(professorId)
  });

  const parseDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatCurrency = (value: number | string | null | undefined) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  const payments = dbPayments
    .filter((item) => !hiddenStatuses.includes(String(item.status || '').toUpperCase()))
    .map((item) => {
      const dueDate = parseDate(item.data_vencimento);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const status = String(item.status || '').toUpperCase();

      return {
        ...item,
        isOverdue: status === 'VENCIDO' || (status === 'PENDENTE' && Boolean(dueDate) && dueDate < today)
      };
    });

  const categories = Array.from(
    new Set(payments.map((item) => String(item.categoria || 'Honorários').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filteredBySearchDateCategory = payments.filter((item) => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const polo = item.polos;
    const matchesSearch = !normalizedSearch || [
      item.descricao,
      item.categoria,
      item.status,
      item.forma_pagamento,
      item.observacao,
      polo?.nome,
      polo?.cidade,
      polo?.estado
    ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));

    const dueDate = parseDate(item.data_vencimento);
    const start = startDate ? parseDate(startDate) : null;
    const end = endDate ? parseDate(endDate) : null;
    const matchesDate = (() => {
      if (!dueDate) return true;
      if (start && dueDate < start) return false;
      if (end && dueDate > end) return false;
      return true;
    })();

    const matchesCategory = categoryFilter === 'TODOS'
      ? true
      : String(item.categoria || 'Honorários') === categoryFilter;

    return matchesSearch && matchesDate && matchesCategory;
  });

  const tabCounts = {
    ABERTO: filteredBySearchDateCategory.filter((item) => String(item.status || '').toUpperCase() === 'PENDENTE' && !item.isOverdue).length,
    ATRASADO: filteredBySearchDateCategory.filter((item) => item.isOverdue).length,
    PAGO: filteredBySearchDateCategory.filter((item) => String(item.status || '').toUpperCase() === 'PAGO').length,
    TODOS: filteredBySearchDateCategory.length
  };

  const filteredPayments = filteredBySearchDateCategory.filter((item) => {
    const status = String(item.status || '').toUpperCase();
    if (statusTab === 'ABERTO') return status === 'PENDENTE' && !item.isOverdue;
    if (statusTab === 'ATRASADO') return item.isOverdue;
    if (statusTab === 'PAGO') return status === 'PAGO';
    return true;
  });

  const totalReceived = payments
    .filter((item) => String(item.status || '').toUpperCase() === 'PAGO')
    .reduce((acc, item) => acc + Number(item.valor_pago || item.valor || 0), 0);

  const totalIncoming = payments
    .filter((item) => ['PENDENTE', 'VENCIDO'].includes(String(item.status || '').toUpperCase()))
    .reduce((acc, item) => acc + Number(item.valor || 0), 0);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);
  const visiblePayments = filteredPayments.slice((currentPageSafe - 1) * pageSize, currentPageSafe * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, startDate, endDate, categoryFilter, statusTab, viewMode]);

  useEffect(() => {
    if (!selectedReceipt) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedReceipt(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedReceipt]);

  const openReceipt = (payment: ProfessorPayment) => {
    if (String(payment.status || '').toUpperCase() !== 'PAGO') {
      setNotice('O recibo fica disponível somente para lançamentos pagos.');
      setTimeout(() => setNotice(''), 2500);
      return;
    }

    setSelectedReceipt(payment);
  };

  const downloadReceiptPdf = async () => {
    if (!selectedReceipt || !receiptRef.current) return;

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

        if (!ctx) throw new Error('Não foi possível preparar o canvas do recibo.');

        ctx.drawImage(canvas, 0, position, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceHeightMm = sliceHeight * ratio;

        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(sliceData, 'PNG', 10, 10, imgWidth, sliceHeightMm);

        remainingHeight -= sliceHeight;
        position += sliceHeight;
        pageIndex += 1;
      }

      const fileName = `recibo-professor-${String(selectedReceipt.id || '').slice(0, 8).toUpperCase() || 'PAGO'}-${new Date().toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);
      setNotice('Recibo baixado com sucesso.');
      setTimeout(() => setNotice(''), 2500);
    } catch {
      setNotice('Não foi possível gerar o PDF do recibo. Tente novamente.');
      setTimeout(() => setNotice(''), 2500);
    } finally {
      setIsGeneratingReceiptPdf(false);
    }
  };

  const safeSetPage = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  const getStatusBadge = (payment: ProfessorPayment) => {
    const status = String(payment.status || '').toUpperCase();

    if (status === 'PAGO') {
      return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-emerald-100">
          <CheckCircle2 size={10} /> Pago
        </span>
      );
    }

    if (payment.isOverdue || status === 'VENCIDO') {
      return (
        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-rose-100">
          <BadgeAlert size={10} /> Atrasado
        </span>
      );
    }

    if (status === 'PENDENTE') {
      return (
        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-amber-100">
          <Clock size={10} /> Em aberto
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-slate-100">
        {status || 'Sem status'}
      </span>
    );
  };

  const renderReceiptAction = (payment: ProfessorPayment, fullWidth = false) => {
    if (String(payment.status || '').toUpperCase() !== 'PAGO') {
      return <span className="text-[10px] text-slate-400 font-bold">Aguardando baixa</span>;
    }

    return (
      <button
        onClick={() => openReceipt(payment)}
        className={`${fullWidth ? 'w-full justify-center' : ''} inline-flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-[10px] uppercase tracking-wider rounded-xl px-3 py-2 transition-colors`}
      >
        <ReceiptText size={13} />
        Recibo PDF
      </button>
    );
  };

  const getReceiptPayload = (payment: ProfessorPayment) => {
    const polo = payment.polos;
    const paidValue = Number(payment.valor_pago || payment.valor || 0);

    return {
      receiptNumber: String(payment.id || '').slice(0, 8).toUpperCase() || 'RECIBO',
      paidAt: formatDate(payment.data_pagamento || payment.data_vencimento),
      dueDate: formatDate(payment.data_vencimento),
      paymentMethod: payment.forma_pagamento || 'Pagamento confirmado',
      description: payment.descricao || 'Honorários docentes',
      category: payment.categoria || 'Honorários',
      poloName: polo?.nome || 'Universo Cursos e Consultoria',
      poloLocation: [polo?.cidade, polo?.estado].filter(Boolean).join(' - ') || 'Polo não informado',
      paidValue: formatCurrency(paidValue),
      generatedAt: formatDate(new Date().toISOString().slice(0, 10))
    };
  };

  const receiptPayload = selectedReceipt ? getReceiptPayload(selectedReceipt) : null;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-10 h-10 border-4 border-purple-650 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="text-purple-600" />
            Financeiro Docente
          </h2>
          <p className="text-xs text-slate-450 font-medium">
            Consulte honorários, vencimentos e recibos dos lançamentos pagos.
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-purple-100 bg-purple-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-purple-700">
          {payments.length} lançamento{payments.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Recebido</p>
            <p className="text-2xl font-black text-emerald-600">{formatCurrency(totalReceived)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Honorários pagos e compensados</p>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="p-6 bg-white border border-slate-100 rounded-3xl shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">A Receber</p>
            <p className="text-2xl font-black text-[#001a33]">{formatCurrency(totalIncoming)}</p>
            <p className="text-[10px] text-slate-500 font-medium">Lançamentos pendentes ou vencidos</p>
          </div>
          <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
            <WalletCards size={22} />
          </div>
        </div>
      </div>

      <section className="bg-white rounded-[2.5rem] border border-slate-100 p-6 md:p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-purple-500" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#001a33]">Histórico de Honorários</h3>
          </div>

          <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
            <button
              type="button"
              title="Visualização em tabela"
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center ${
                viewMode === 'table'
                  ? 'bg-[#001a33] text-white shadow'
                  : 'bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              title="Visualização em cards"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors inline-flex items-center justify-center ${
                viewMode === 'cards'
                  ? 'bg-[#001a33] text-white shadow'
                  : 'bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>

        {notice && (
          <div className="mb-4 rounded-2xl border border-purple-100 bg-purple-50 px-4 py-3 text-xs font-bold text-purple-700">
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
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por descrição, polo, status ou forma de pagamento"
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-500 font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data inicial</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-500 font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Data final</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-500 font-bold text-slate-700"
            />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 block">
              <span className="inline-flex items-center gap-1"><Filter size={12} /> Categoria</span>
            </label>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-500 font-bold text-slate-700"
            >
              <option value="TODOS">Todas</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
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
              type="button"
              onClick={() => setStatusTab(tab.key as StatusTab)}
              className={`px-3 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors ${
                statusTab === tab.key
                  ? 'bg-[#001a33] text-white shadow'
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
            Exibindo <strong className="font-black">{filteredPayments.length}</strong> lançamento{filteredPayments.length === 1 ? '' : 's'}
            {filteredPayments.length !== payments.length && (
              <span> de <strong className="font-black">{payments.length}</strong> no total</span>
            )}
          </span>
          {categoryFilter !== 'TODOS' && <span className="uppercase text-purple-600">Categoria: {categoryFilter}</span>}
        </div>

        {viewMode === 'table' ? (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs font-medium text-slate-500">
              <thead>
                <tr className="border-b border-slate-100 text-[10px] text-slate-400 font-black uppercase tracking-wider">
                  <th className="py-4 px-4">Lançamento</th>
                  <th className="py-4 px-4">Categoria</th>
                  <th className="py-4 px-4">Vencimento</th>
                  <th className="py-4 px-4">Valor</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4">Pagamento</th>
                  <th className="py-4 px-4 text-right">Recibo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiblePayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-xs font-bold text-slate-400">
                      Nenhum lançamento encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : visiblePayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-bold text-slate-800">{payment.descricao || 'Honorários docentes'}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        {payment.polos?.nome || 'Polo não informado'}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-purple-50 text-purple-700 border-purple-100">
                        {payment.categoria || 'Honorários'}
                      </span>
                    </td>
                    <td className="py-4 px-4">{formatDate(payment.data_vencimento)}</td>
                    <td className="py-4 px-4 font-bold text-[#001a33]">{formatCurrency(payment.valor)}</td>
                    <td className="py-4 px-4">{getStatusBadge(payment)}</td>
                    <td className="py-4 px-4">
                      {String(payment.status || '').toUpperCase() === 'PAGO' ? (
                        <span className="text-[10px] font-bold text-slate-650 bg-slate-100 px-2 py-0.5 rounded">
                          {formatDate(payment.data_pagamento)} via {payment.forma_pagamento || 'Pix'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-bold">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">{renderReceiptAction(payment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            {visiblePayments.length === 0 ? (
              <div className="px-4 py-12 text-center text-xs font-bold text-slate-400">
                Nenhum lançamento encontrado com os filtros atuais.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {visiblePayments.map((payment) => (
                  <article key={payment.id} className="relative overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="absolute -right-10 -top-10 w-28 h-28 rounded-full bg-purple-100/50 blur-2xl" />
                    <div className="relative space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex max-w-[68%] items-center text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-purple-50 text-purple-700 border-purple-100">
                          {payment.categoria || 'Honorários'}
                        </span>
                        {getStatusBadge(payment)}
                      </div>

                      <h4 className="text-sm font-black text-[#001a33] leading-snug line-clamp-2">
                        {payment.descricao || 'Honorários docentes'}
                      </h4>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 space-y-2 text-[11px] text-slate-600">
                        <p className="inline-flex items-start gap-2">
                          <CalendarDays size={14} className="text-slate-500 mt-0.5 shrink-0" />
                          <span>
                            <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Vencimento</span>
                            <span className="font-bold text-slate-700">{formatDate(payment.data_vencimento)}</span>
                          </span>
                        </p>

                        <p className="inline-flex items-start gap-2">
                          <WalletCards size={14} className="text-slate-500 mt-0.5 shrink-0" />
                          <span>
                            <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Valor</span>
                            <span className="font-black text-[#001a33]">{formatCurrency(payment.valor)}</span>
                          </span>
                        </p>

                        <p className="inline-flex items-start gap-2">
                          <FileText size={14} className="text-slate-500 mt-0.5 shrink-0" />
                          <span>
                            <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Polo</span>
                            <span className="font-bold text-slate-700">
                              {payment.polos?.nome || 'Polo não informado'}
                              {[payment.polos?.cidade, payment.polos?.estado].filter(Boolean).length > 0
                                ? ` • ${[payment.polos?.cidade, payment.polos?.estado].filter(Boolean).join(' - ')}`
                                : ''}
                            </span>
                          </span>
                        </p>

                        {String(payment.status || '').toUpperCase() === 'PAGO' && (
                          <p className="inline-flex items-start gap-2">
                            <span className="text-slate-400 mt-0.5 font-black uppercase text-[10px] tracking-widest min-w-[14px]">•</span>
                            <span>
                              <span className="block text-slate-400 text-[10px] font-black uppercase tracking-widest">Pagamento</span>
                              <span className="font-bold text-slate-700">
                                {formatDate(payment.data_pagamento)} via {payment.forma_pagamento || 'Pix'}
                              </span>
                            </span>
                          </p>
                        )}
                      </div>

                      <div>{renderReceiptAction(payment, true)}</div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-[11px] text-slate-500 font-bold">
            Página {currentPageSafe} de {totalPages}
          </p>
          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => safeSetPage(currentPageSafe - 1)}
              disabled={currentPageSafe === 1}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => safeSetPage(currentPageSafe + 1)}
              disabled={currentPageSafe === totalPages}
              className="px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      </section>

      {selectedReceipt && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] pointer-events-auto flex items-center justify-center p-4 overflow-y-auto min-h-screen"
          onClick={() => setSelectedReceipt(null)}
        >
          <div
            className="bg-white rounded-[1.75rem] p-5 sm:p-6 max-w-2xl w-full border border-slate-100 shadow-2xl relative animate-fadeIn overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setSelectedReceipt(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-full transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex flex-col gap-2 mb-6">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">Universo Cursos e Consultoria</p>
              <h4 className="text-xl font-black text-[#001a33]">Recibo de honorários</h4>
              <p className="text-[10px] text-slate-500 font-medium">
                Comprovante financeiro para consulta do docente.
              </p>
            </div>

            <div ref={receiptRef} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 print-area">
              <div className="flex flex-col gap-4 md:flex-row md:justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-[0.2em]">Número do Recibo</p>
                  <p className="text-base font-black text-[#001a33] mt-1">{receiptPayload?.receiptNumber}</p>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-100 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest">
                    PAGO
                  </span>
                  <p className="text-[9px] font-black uppercase text-slate-500 mt-1.5">Gerado em {receiptPayload?.generatedAt}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
                <div className="rounded-xl border border-slate-150 bg-white p-3">
                  <p className="text-[9px] text-slate-400 font-black uppercase">Pagamento</p>
                  <p className="text-xs font-bold mt-1.5 text-slate-700">{receiptPayload?.paidAt}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">{receiptPayload?.paymentMethod}</p>
                </div>
                <div className="rounded-xl border border-slate-150 bg-white p-3">
                  <p className="text-[9px] text-slate-400 font-black uppercase">Vencimento original</p>
                  <p className="text-xs font-bold mt-1.5 text-slate-700">{receiptPayload?.dueDate}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">Data de referência</p>
                </div>
                <div className="rounded-xl border border-slate-150 bg-white p-3">
                  <p className="text-[9px] text-slate-400 font-black uppercase">Polo</p>
                  <p className="text-xs font-bold mt-1.5 text-slate-700">{receiptPayload?.poloName}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">{receiptPayload?.poloLocation}</p>
                </div>
                <div className="rounded-xl border border-slate-150 bg-white p-3">
                  <p className="text-[9px] text-slate-400 font-black uppercase">Categoria</p>
                  <p className="text-xs font-bold mt-1.5 text-slate-700">{receiptPayload?.category}</p>
                  <p className="text-[10px] text-slate-500 mt-1 font-medium">Lançamento financeiro</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-purple-100 bg-purple-50 p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-purple-700">Descrição</p>
                <p className="text-xs text-purple-950 font-semibold mt-1.5 leading-relaxed">{receiptPayload?.description}</p>
              </div>

              <div className="mt-4 rounded-2xl bg-[#001a33] text-white p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.2em] text-purple-200">Valor pago</p>
                  <p className="text-3xl font-black mt-1 text-white">{receiptPayload?.paidValue}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.2em] text-purple-200">Status</p>
                  <p className="text-sm font-black mt-1 text-emerald-300">PAGO</p>
                </div>
              </div>

              <p className="mt-4 text-[9px] text-slate-500 leading-relaxed">
                Este documento foi emitido automaticamente em razão de pagamento confirmado no Portal do Professor.
                Em caso de inconsistência, procure a coordenação financeira da instituição.
              </p>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-xl transition-colors"
              >
                Fechar
              </button>
              <button
                type="button"
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

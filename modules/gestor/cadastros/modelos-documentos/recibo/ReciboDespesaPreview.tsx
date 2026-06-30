// File: modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPreview.tsx
// Componente de preview e função de impressão do recibo de despesa

import React from 'react';
import { DespesaLancamento } from '../../../financeiro/despesas/despesas.service';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDate = (value?: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : '-';

export interface ReciboData {
  reciboTitulo?: string;
  reciboNumero?: string;
  contraparteLabel?: string;
  assinaturaNome?: string;
  descricao: string;
  valor: number;
  dataVencimento: string;
  dataPagamento?: string;
  valorPago?: number;
  fornecedorNome?: string;
  fornecedorId?: string;
  categoriaNome?: string;
  formaPagamento?: string;
  poloNome?: string;
  parcelaNumero?: number;
  totalParcelas?: number;
  observacao?: string;
  status?: string;
  // Dados da empresa (preenchidos em runtime)
  empresaNome?: string;
  empresaCnpj?: string;
  empresaEndereco?: string;
  logoUrl?: string;
}

export const despesaToReciboData = (item: DespesaLancamento, empresaInfo?: Partial<ReciboData>): ReciboData => ({
  descricao: item.descricao,
  valor: item.valor,
  dataVencimento: item.dataVencimento,
  dataPagamento: item.dataPagamento,
  valorPago: item.valorPago,
  fornecedorNome: item.fornecedorNome,
  fornecedorId: item.fornecedorId,
  categoriaNome: item.categoriaNome,
  formaPagamento: item.formaPagamento,
  poloNome: item.poloNome,
  parcelaNumero: item.parcelaNumero,
  totalParcelas: item.totalParcelas,
  observacao: item.observacao,
  status: item.status,
  ...empresaInfo,
});

// ============================================================
// Função de impressão HTML
// ============================================================
export const printReciboDespesa = (data: ReciboData) => {
  const numExtenso = (() => {
    // Básico — para valores até 999.999
    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const onze = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const centenas = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    const inteiro = Math.floor(data.valorPago ?? data.valor);
    const cents = Math.round(((data.valorPago ?? data.valor) - inteiro) * 100);

    const parseGroup = (n: number): string => {
      if (n === 0) return '';
      if (n === 100) return 'cem';
      const c = Math.floor(n / 100);
      const d = Math.floor((n % 100) / 10);
      const u = n % 10;
      const parts: string[] = [];
      if (c) parts.push(centenas[c]);
      if (d === 1) parts.push(onze[u]);
      else {
        if (d) parts.push(dezenas[d]);
        if (u) parts.push(unidades[u]);
      }
      return parts.join(' e ');
    };

    const reais = parseGroup(inteiro);
    const centavos = parseGroup(cents);
    if (!reais && !centavos) return 'zero reais';
    const partes: string[] = [];
    if (reais) partes.push(`${reais} ${inteiro === 1 ? 'real' : 'reais'}`);
    if (centavos) partes.push(`${centavos} ${cents === 1 ? 'centavo' : 'centavos'}`);
    return partes.join(' e ');
  })();

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Recibo de Despesa</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Arial, sans-serif; background: #fff; color: #001a33; }
  .page { width: 210mm; min-height: 148mm; margin: 0 auto; padding: 24mm 20mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; border-bottom: 2px solid #001a33; padding-bottom: 6mm; }
  .logo-area h1 { font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: -0.5px; color: #001a33; }
  .logo-area p { font-size: 10px; color: #64748b; margin-top: 2px; }
  .recibo-label { text-align: right; }
  .recibo-label .badge { display: inline-block; background: #001a33; color: #fff; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; padding: 4px 12px; border-radius: 8px; }
  .recibo-label .num { font-size: 20px; font-weight: 900; color: #001a33; margin-top: 4px; }
  .valor-destaque { background: #f8fafc; border: 2px solid #001a33; border-radius: 12px; padding: 8mm 12mm; text-align: center; margin-bottom: 8mm; }
  .valor-destaque .valor { font-size: 36px; font-weight: 900; color: #001a33; }
  .valor-destaque .extenso { font-size: 11px; color: #64748b; margin-top: 4px; text-transform: capitalize; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 8mm; }
  .field label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 1mm; }
  .field span { font-size: 12px; font-weight: 600; color: #001a33; }
  .field small { display: block; font-size: 10px; font-weight: 600; color: #64748b; margin-top: 1mm; }
  .descricao-box { background: #f1f5f9; border-radius: 8px; padding: 5mm; margin-bottom: 8mm; }
  .descricao-box label { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 2mm; }
  .descricao-box p { font-size: 13px; font-weight: 600; color: #001a33; }
  .status-pago { display: inline-flex; align-items: center; gap: 6px; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 8px; padding: 3px 10px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
  .footer { border-top: 1px dashed #cbd5e1; padding-top: 6mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .assinatura { text-align: center; }
  .assinatura .linha { border-top: 1px solid #001a33; width: 60mm; margin: 0 auto 3mm; }
  .assinatura p { font-size: 10px; color: #64748b; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo-area">
      <h1>${data.empresaNome || 'Universo Cursos e Consultoria'}</h1>
      <p>${data.empresaCnpj ? `CNPJ: ${data.empresaCnpj}` : ''}</p>
      ${data.poloNome ? `<p>Unidade: ${data.poloNome}</p>` : ''}
    </div>
    <div class="recibo-label">
      <div class="badge">${data.reciboTitulo || 'Recibo de Despesa'}</div>
      <div class="num">${data.reciboNumero || (data.totalParcelas && data.totalParcelas > 1 ? `Parcela ${data.parcelaNumero}/${data.totalParcelas}` : '')}</div>
    </div>
  </div>

  <div class="valor-destaque">
    <div class="valor">${formatCurrency(data.valorPago ?? data.valor)}</div>
    <div class="extenso">${numExtenso}</div>
  </div>

  <div class="descricao-box">
    <label>Descrição</label>
    <p>${data.descricao}</p>
    ${data.categoriaNome ? `<p style="font-size:10px;color:#64748b;margin-top:3px;">Categoria: ${data.categoriaNome}</p>` : ''}
  </div>

  <div class="grid">
    <div class="field">
      <label>${data.contraparteLabel || 'Fornecedor / Credor'}</label>
      <span>${data.fornecedorNome || 'Não informado'}</span>
      ${data.fornecedorId ? `<small>CPF/CNPJ: ${data.fornecedorId}</small>` : ''}
    </div>
    <div class="field">
      <label>Data de Vencimento</label>
      <span>${formatDate(data.dataVencimento)}</span>
    </div>
    ${data.dataPagamento ? `
    <div class="field">
      <label>Data de Pagamento</label>
      <span>${formatDate(data.dataPagamento)}</span>
    </div>` : ''}
    ${data.formaPagamento ? `
    <div class="field">
      <label>Forma de Pagamento</label>
      <span>${data.formaPagamento}</span>
    </div>` : ''}
    <div class="field">
      <label>Status</label>
      <span>
        ${data.status === 'PAGO'
          ? '<span class="status-pago">✓ Pago</span>'
          : data.status || 'Pendente'}
      </span>
    </div>
    <div class="field">
      <label>Emissão</label>
      <span>${new Date().toLocaleDateString('pt-BR')}</span>
    </div>
  </div>

  ${data.observacao ? `
  <div style="font-size:11px;color:#64748b;margin-bottom:6mm;">
    <strong>Obs:</strong> ${data.observacao}
  </div>` : ''}

  <div class="footer">
    <div style="font-size:10px;color:#94a3b8;">Documento gerado em ${new Date().toLocaleString('pt-BR')}</div>
    <div class="assinatura">
      <div class="linha"></div>
      <p>${data.assinaturaNome || data.empresaNome || 'Responsável Financeiro'}</p>
      <p style="font-size:9px;">${data.poloNome || ''}</p>
    </div>
  </div>
</div>
<script>window.onload = () => { window.print(); window.close(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
};

// ============================================================
// Componente de Preview (usado na página de modelos)
// ============================================================
interface ReciboDespesaPreviewProps {
  data?: Partial<ReciboData>;
}

const ReciboDespesaPreview: React.FC<ReciboDespesaPreviewProps> = ({ data }) => {
  const sample: ReciboData = {
    empresaNome: data?.empresaNome || 'Universo Cursos e Consultoria',
    empresaCnpj: data?.empresaCnpj || '00.000.000/0001-00',
    poloNome: data?.poloNome || 'Polo Matriz — Aracaju/SE',
    descricao: data?.descricao || 'Aluguel de Outubro — Sede Principal',
    valor: data?.valor ?? 2500,
    valorPago: data?.valorPago ?? 2500,
    dataVencimento: data?.dataVencimento || new Date().toISOString().slice(0, 10),
    dataPagamento: data?.dataPagamento || new Date().toISOString().slice(0, 10),
    fornecedorNome: data?.fornecedorNome || 'João Silva Imóveis',
    fornecedorId: data?.fornecedorId,
    categoriaNome: data?.categoriaNome || 'Aluguel',
    formaPagamento: data?.formaPagamento || 'PIX',
    status: data?.status || 'PAGO',
    parcelaNumero: data?.parcelaNumero ?? 1,
    totalParcelas: data?.totalParcelas ?? 1,
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  const formatDate = (s?: string) =>
    s ? new Date(`${s}T00:00:00`).toLocaleDateString('pt-BR') : '-';

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm font-sans max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-[#001a33] pb-5 mb-6">
        <div>
          <h1 className="text-xl font-black text-[#001a33] uppercase tracking-tight">{sample.empresaNome}</h1>
          {sample.empresaCnpj && <p className="text-xs text-slate-400 mt-0.5">CNPJ: {sample.empresaCnpj}</p>}
          {sample.poloNome && <p className="text-xs text-slate-500 mt-0.5">Unidade: {sample.poloNome}</p>}
        </div>
        <div className="text-right">
          <span className="inline-block bg-[#001a33] text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg">
            {sample.reciboTitulo || 'Recibo de Despesa'}
          </span>
          {sample.reciboNumero && <p className="text-sm font-black text-[#001a33] mt-1">{sample.reciboNumero}</p>}
        </div>
      </div>

      {/* Valor */}
      <div className="bg-slate-50 border-2 border-[#001a33] rounded-2xl p-6 text-center mb-6">
        <p className="text-4xl font-black text-[#001a33]">{formatCurrency(sample.valorPago ?? sample.valor)}</p>
        <p className="text-xs text-slate-400 mt-1">Valor do pagamento</p>
      </div>

      {/* Descrição */}
      <div className="bg-slate-50 rounded-xl p-4 mb-5">
        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">Descrição</p>
        <p className="font-semibold text-slate-800">{sample.descricao}</p>
        {sample.categoriaNome && (
          <p className="text-xs text-slate-400 mt-1">Categoria: {sample.categoriaNome}</p>
        )}
      </div>

      {/* Grid de campos */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {[
          {
            label: sample.contraparteLabel || 'Fornecedor',
            value: sample.fornecedorNome || '—',
            detail: sample.fornecedorId ? `CPF/CNPJ: ${sample.fornecedorId}` : undefined,
          },
          { label: 'Data Vencimento', value: formatDate(sample.dataVencimento) },
          { label: 'Data Pagamento', value: formatDate(sample.dataPagamento) },
          { label: 'Forma de Pagamento', value: sample.formaPagamento || '—' },
          { label: 'Status', value: sample.status || '—' },
          { label: 'Emissão', value: new Date().toLocaleDateString('pt-BR') },
        ].map((f) => (
          <div key={f.label}>
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-0.5">{f.label}</p>
            <p className="text-sm font-semibold text-slate-700">{f.value}</p>
            {'detail' in f && f.detail && <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{f.detail}</p>}
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div className="border-t border-dashed border-slate-300 pt-5 flex justify-between items-end">
        <p className="text-[10px] text-slate-400">
          Gerado em: {new Date().toLocaleString('pt-BR')}
        </p>
        <div className="text-center">
          <div className="border-t border-slate-800 w-40 mx-auto mb-2" />
          <p className="text-xs font-semibold text-slate-600">{sample.empresaNome}</p>
          <p className="text-[10px] text-slate-400">{sample.poloNome}</p>
        </div>
      </div>
    </div>
  );
};

export default ReciboDespesaPreview;

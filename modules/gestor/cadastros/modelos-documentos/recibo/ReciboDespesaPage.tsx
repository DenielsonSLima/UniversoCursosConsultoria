// File: modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPage.tsx

import React from 'react';
import { Receipt, Printer } from 'lucide-react';
import ReciboDespesaPreview, { printReciboDespesa } from './ReciboDespesaPreview';

const ReciboDespesaPage: React.FC = () => {
  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2 text-rose-600">
            <Receipt size={20} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Modelos de Documentos</span>
          </div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Modelo Recibo
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Recibo de pagamento de despesas fixas, variáveis e outros débitos.
            <br />
            O recibo é gerado automaticamente ao lançar e dar baixa em uma despesa.
          </p>
        </div>
        <button
          onClick={() =>
            printReciboDespesa({
              empresaNome: 'Universo Cursos e Consultoria',
              descricao: 'Aluguel de Outubro — Sede Principal',
              valor: 2500,
              valorPago: 2500,
              dataVencimento: new Date().toISOString().slice(0, 10),
              dataPagamento: new Date().toISOString().slice(0, 10),
              fornecedorNome: 'João Silva Imóveis',
              categoriaNome: 'Aluguel',
              formaPagamento: 'PIX',
              poloNome: 'Polo Matriz — Aracaju/SE',
              status: 'PAGO',
            })
          }
          className="flex items-center gap-2 px-6 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-2xl font-bold uppercase tracking-wide text-sm shadow-md transition-colors"
        >
          <Printer size={16} />
          Imprimir Exemplo
        </button>
      </div>

      {/* Preview */}
      <div className="bg-slate-50 rounded-3xl p-8 border border-slate-200">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 text-center mb-6">
          — Preview do Modelo —
        </p>
        <ReciboDespesaPreview />
      </div>

      {/* Instruções */}
      <div className="mt-8 p-6 bg-blue-50 rounded-2xl border border-blue-100">
        <h3 className="text-sm font-black text-blue-800 uppercase tracking-wide mb-3">Como usar</h3>
        <ul className="space-y-2 text-xs text-blue-700 font-medium">
          <li>• Acesse <strong>Financeiro → Despesas Fixas</strong> ou <strong>Despesas Variáveis</strong></li>
          <li>• Crie um lançamento com a opção <strong>"Lançar e Dar Baixa"</strong>, ou dê baixa em um lançamento existente</li>
          <li>• Após confirmar o pagamento, clique no ícone de impressora na linha/card do lançamento</li>
          <li>• O recibo será gerado automaticamente com todos os dados do lançamento</li>
        </ul>
      </div>
    </div>
  );
};

export default ReciboDespesaPage;

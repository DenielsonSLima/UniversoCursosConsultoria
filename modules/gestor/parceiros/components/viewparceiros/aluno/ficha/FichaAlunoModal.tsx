import React, { useRef } from 'react';
import { X, Printer, User, CheckCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { empresasService } from '../../../../../configuracoes/empresas/empresas.service';
import { polosService } from '../../../../../configuracoes/polos/polos.service';
import DocumentHeader from '../../../../../components/DocumentHeader';
import { formatMatricula } from '../../../../../../../lib/academicUtils';

interface FichaAlunoModalProps {
  aluno: any;
  onClose: () => void;
}

const FichaAlunoModal: React.FC<FichaAlunoModalProps> = ({ aluno, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);

  const { data: company } = useQuery<any>({
    queryKey: ['empresa_principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
  });

  // current_polo_id é estado de sessão UI — sessionStorage é adequado
  const poloId = aluno?.poloId || sessionStorage.getItem('current_polo_id');
  const { data: polo } = useQuery<any>({
    queryKey: ['polo_detalhes', poloId],
    queryFn: () => poloId ? polosService.getById(poloId) : Promise.resolve(null),
    enabled: !!poloId,
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      {/* Container principal do modal */}
      <div className="bg-slate-100 w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp">
        
        {/* Header do Modal */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200">
          <div>
            <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">Ficha Cadastral do Aluno</h3>
            <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">Pré-visualização do Documento</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#001a33] text-white rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
            >
              <Printer size={16} /> Imprimir / PDF
            </button>
            <div className="w-px h-8 bg-slate-200 mx-1"></div>
            <button 
              onClick={onClose}
              className="p-2.5 bg-slate-100 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Área de Visualização (Fundo cinza para simular leitor de PDF) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex justify-center pb-20 custom-scrollbar">
          
          {/* A4 Papel - Área de Impressão */}
          {/* Use 'print:' classes to customize the print behavior */}
          <div 
            ref={printRef}
            className="bg-white w-full max-w-[210mm] min-h-[297mm] shadow-md p-6 sm:p-10 print:shadow-none print:p-0 print:w-auto print:max-w-none print:min-h-0 flex flex-col relative"
            id="print-area"
          >
            {/* Watermark (Marca d'água) */}
            {polo?.watermark_url && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
                <img 
                  src={polo.watermark_url} 
                  alt="Watermark" 
                  style={{
                    opacity: polo.watermark_opacity ?? 0.1,
                    width: `${polo.watermark_scale ?? 50}%`,
                    transform: 'rotate(-45deg)'
                  }}
                />
              </div>
            )}

            {/* Header com Logo e Info da Empresa e Polo */}
            <DocumentHeader 
              company={company} 
              polo={polo} 
              orientation="portrait" 
              rightContent={
                <div className="text-right">
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Ficha Cadastral</h2>
                  <div className="px-3 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Matrícula</p>
                     <p className="text-sm font-bold text-[#001a33]">{aluno?.id ? formatMatricula(aluno.id, aluno.created_at, aluno.polo_id) : 'NOVA_MATRICULA'}</p>
                  </div>
                </div>
              }
            />

            {/* Foto e Resumo */}
            <div className="flex gap-6 mb-4 items-center border border-slate-300 p-3 rounded-xl relative z-10 bg-white/90">
               <div className="w-24 h-32 bg-slate-200 border-2 border-slate-300 rounded-lg flex flex-col items-center justify-center text-slate-400 overflow-hidden relative">
                 {aluno?.foto ? (
                   <img src={aluno.foto} alt="Foto Aluno" className="w-full h-full object-cover" />
                 ) : (
                   <>
                     <User size={32} className="mb-2" />
                     <span className="text-[8px] font-bold uppercase tracking-widest text-center px-2">Foto 3x4</span>
                   </>
                 )}
               </div>
               <div className="flex-1">
                 <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-1">{aluno?.nome || 'Nome não informado'}</h3>
                 <p className="text-xs font-bold text-slate-600 uppercase mb-4 tracking-wider">Curso: {aluno?.curso || 'Não especificado'}</p>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Turma</p>
                      <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.turmaId || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Data de Ingresso</p>
                      <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.dataIngresso || new Date().toLocaleDateString()}</p>
                    </div>
                 </div>
               </div>
            </div>

            {/* Dados Pessoais */}
            <div className="mb-4 relative z-10">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2 border-b-2 border-slate-300 pb-1">Dados Pessoais</h4>
              <div className="grid grid-cols-3 gap-y-3 gap-x-6 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="col-span-3">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nome Social</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.nomeSocial || 'Não informado'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">CPF</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.cpf || '000.000.000-00'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">RG</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.rg || '0000000'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Data de Nascimento</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.dataNascimento || '00/00/0000'}</p>
                </div>
                
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Estado Civil</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.estadoCivil || 'Solteiro(a)'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nacionalidade</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.nacionalidade || 'Brasileira'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Naturalidade</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.naturalidade || 'Não informada'}</p>
                </div>
                <div className="col-span-3 border-t border-slate-200 mt-2 pt-4 grid grid-cols-2 gap-6">
                  <div className="col-span-1">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nome da Mãe</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.nomeMae || 'Não informado'}</p>
                  </div>
                  <div className="col-span-1">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Nome do Pai</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{aluno?.nomePai || 'Não informado'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Contato e Endereço */}
            <div className="mb-4 relative z-10">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2 border-b-2 border-slate-300 pb-1">Contato & Endereço</h4>
              <div className="grid grid-cols-2 gap-y-3 gap-x-6 border border-slate-200 p-3 rounded-xl">
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Email</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.email || 'email@exemplo.com'}</p>
                </div>
                <div className="col-span-1">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Celular / WhatsApp</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.telefone || '(00) 00000-0000'}</p>
                </div>
                
                <div className="col-span-2 mt-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Endereço Completo</p>
                  <p className="text-xs font-bold text-slate-800">
                    {aluno?.logradouro ? `${aluno.logradouro}, ${aluno.numero || 'S/N'}` : 'Rua Exemplo, 123'} - {aluno?.bairro || 'Bairro'} - {aluno?.cidade || 'Cidade'}/{aluno?.estado || 'UF'}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">CEP</p>
                  <p className="text-xs font-bold text-slate-800">{aluno?.cep || '00000-000'}</p>
                </div>
              </div>
            </div>
            
            {/* Responsável Financeiro */}
            <div className="mb-4 relative z-10">
              <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-2 border-b-2 border-slate-300 pb-1">Responsável Financeiro</h4>
              <div className="flex gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-emerald-500" /> O próprio aluno é o responsável financeiro.
                </div>
              </div>
            </div>

            <div className="flex-1"></div>

            {/* Termo de aceite e Assinaturas */}
            <div className="mt-8 pt-6 border-t-2 border-slate-900 border-dashed relative z-10">
              <p className="text-[10px] text-slate-600 font-medium text-justify mb-8 leading-relaxed">
                Declaro para os devidos fins que as informações prestadas nesta ficha cadastral são verdadeiras. 
                Estou ciente do regulamento interno da instituição e dos termos contratuais relativos à prestação de serviços educacionais 
                para o curso supracitado. Autorizo a instituição a utilizar meus dados para fins acadêmicos e comunicações oficiais.
              </p>
              
              <div className="flex justify-between items-end">
                <div className="text-center w-64">
                   <div className="border-b border-slate-800 h-8 mb-2 w-full"></div>
                   <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Assinatura do Aluno</p>
                   <p className="text-[9px] font-bold text-slate-500 uppercase">{aluno?.nome}</p>
                </div>
                <div className="text-center w-48">
                   <div className="border-b border-slate-800 h-8 mb-2 w-full text-center text-xs font-mono text-slate-600 items-end flex justify-center pb-1">
                      ___ / ___ / ______
                   </div>
                   <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Data</p>
                   <p className="text-[9px] font-bold text-slate-500 uppercase">Local: {aluno?.cidade || 'Aracaju'} / {aluno?.estado || 'SE'}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 text-center text-[8px] font-bold text-slate-400 uppercase tracking-widest">
              Gerado pelo Sistema Integrado em {new Date().toLocaleString()}
            </div>

          </div>
        </div>
      </div>
      
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default FichaAlunoModal;

import React from 'react';
import { QrCode, User, CreditCard } from 'lucide-react';

interface CarteirinhaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
}

const CarteirinhaPreview: React.FC<CarteirinhaPreviewProps> = ({ formData, page, zoomLevel }) => {
  // Tamanho padrão CR80: 85.6mm x 54mm (landscape)
  
  const studentData = {
    nome: 'ANA CLARA DOS SANTOS E SILVA',
    cpf: '123.456.789-00',
    rg: '12.345.678-9',
    nascimento: '15/08/2005',
    matricula: '2026100123',
    curso: formData.tipoCurso === 'Cursos Livres' ? 'Design Gráfico para Web' : 'Técnico em Informática',
    instituição: 'Instituto EAD e Tecnologia',
    validade: '31/03/2027'
  };

  return (
    <div 
      className="bg-white w-[85.6mm] h-[54mm] shadow-2xl relative flex flex-col rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200"
      style={{ 
        transform: `scale(${zoomLevel / 100})`, 
        // Compensate the margin when scaling down or up so they don't overlap strangely, similar to diploma
        marginBottom: zoomLevel < 100 ? `-${54 * (1 - zoomLevel / 100)}mm` : '0'
      }}
    >
       {page === 'frente' ? (
         // DESIGN FRENTE 
         <>
           {/* Cabeçalho colorido */}
           <div 
             className="h-10 flex items-center justify-center shrink-0"
             style={{ backgroundColor: formData.corPrimaria, color: '#fff' }}
           >
             <h2 className="text-[12px] font-black uppercase tracking-widest">{formData.textoFrente || 'CIE - Documento do Estudante'}</h2>
           </div>

           <div className="flex flex-1 relative bg-white">
              {/* Coluna da Foto */}
              <div className="w-[22mm] h-full flex flex-col items-center justify-start py-2 px-2 border-r border-slate-100 z-10" style={{ backgroundColor: formData.corSecundaria + '20' }}>
                 <div className="w-[18mm] h-[24mm] bg-white border border-slate-300 flex items-center justify-center rounded">
                    {/* Placeholder de Foto */}
                    <User size={32} className="text-slate-300" />
                 </div>
                 <div className="mt-2 text-center w-full bg-slate-900 text-white rounded p-0.5">
                    <p className="text-[6px] font-black uppercase tracking-wider">{studentData.validade.split('/')[2]}</p>
                 </div>
              </div>

              {/* Coluna de Dados */}
              <div className="flex-1 py-2 px-3 pl-2 flex flex-col justify-between z-10">
                 <div>
                    <h3 className="text-[10px] font-black text-slate-800 uppercase leading-tight line-clamp-2">
                      {studentData.nome}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                       <div>
                         <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">CPF</p>
                         <p className="text-[7px] font-bold text-slate-800">{studentData.cpf}</p>
                       </div>
                       <div>
                         <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">RG</p>
                         <p className="text-[7px] font-bold text-slate-800">{studentData.rg}</p>
                       </div>
                       <div>
                         <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Nascimento</p>
                         <p className="text-[7px] font-bold text-slate-800">{studentData.nascimento}</p>
                       </div>
                       <div>
                         <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Matrícula</p>
                         <p className="text-[7px] font-bold text-slate-800">{studentData.matricula}</p>
                       </div>
                    </div>

                    <div className="mt-1">
                      <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Curso</p>
                      <p className="text-[8px] font-black text-slate-800 uppercase line-clamp-1">{studentData.curso}</p>
                    </div>
                    <div className="mt-1">
                      <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">Instituição</p>
                      <p className="text-[7px] font-bold text-slate-700 uppercase line-clamp-1">{studentData.instituição}</p>
                    </div>
                 </div>
                 
                 <div className="flex items-center justify-between border-t border-slate-200 pt-1 mt-1">
                   <p className="text-[6px] font-black" style={{ color: formData.corPrimaria }}>
                      Válida até {studentData.validade}
                   </p>
                   {formData.tipoCurso === 'Cursos Livres' && (
                     <span className="text-[5px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded uppercase">Uso Interno</span>
                   )}
                 </div>
              </div>

              {/* Marca d'água super sutil */}
              <div className="absolute inset-0 z-0 flex items-center justify-center opacity-5 pointer-events-none overflow-hidden">
                <CreditCard size={120} style={{ color: formData.corPrimaria, transform: 'rotate(-20deg)' }} />
              </div>
           </div>
         </>
       ) : (
         // DESIGN VERSO
         <>
           <div className="flex-1 flex flex-col p-3 relative bg-slate-50">
             
             {/* Textos legais e informações */}
             <div className="flex-1 pr-12 mt-6 text-[5px] text-slate-700 leading-relaxed text-justify whitespace-pre-wrap font-medium">
               {formData.textoVerso}
             </div>

             {/* QR Code Validation Area fixed on the right side */}
             <div className="absolute top-2 right-2 bottom-2 w-14 border-l border-slate-300 pl-2 flex flex-col items-center justify-center text-center">
                <QrCode size={38} className="text-slate-800 mb-1" />
                <p className="text-[4px] font-black text-slate-500 uppercase tracking-widest leading-tight">
                  Validação<br/>Digital
                </p>
             </div>

             {/* Footer do Verso */}
             <div className="border-t border-slate-300 pt-1 mt-1 pr-14">
               <p className="text-[4px] font-bold text-slate-500 text-center uppercase">
                 Documento emitido digitalmente integrado ao sistema acadêmico
               </p>
             </div>

              {/* Tarja Magnética ou Barra de cor (estética) */}
              <div 
                className="absolute top-0 left-0 right-0 h-4 bg-slate-800"
              ></div>
           </div>
         </>
       )}
    </div>
  );
};

export default CarteirinhaPreview;

import React from 'react';
import { QrCode } from 'lucide-react';

interface DiplomaPreviewProps {
  formData: any;
  page: 'frente' | 'verso';
  zoomLevel: number;
}

const DiplomaPreview: React.FC<DiplomaPreviewProps> = ({ formData, page, zoomLevel }) => {
  // Dados fictícios para preencher o visualizador
  const previewData = {
    nome_aluno: 'JOÃO DA SILVA SAURO',
    cpf: '123.456.789-00',
    curso_nome: formData.tipoCurso === 'Cursos Técnicos' ? 'Técnico em Enfermagem' : 'Enfermagem',
    carga_horaria: '1200',
    data_conclusao: '20 de Maio de 2026',
    grade_curricular: `
      Anatomia Humana - 80h - Nota: 9.0
      Fisiologia - 80h - Nota: 8.5
      Primeiros Socorros - 40h - Nota: 10.0
    `,
    livro_registro: 'Livro: 12, Folha: 45, Registro: 1024'
  };

  // Helper para substituir variáveis simples por negrito no preview
  const parseText = (text: string) => {
    if (!text) return '';
    let parsed = text;
    Object.keys(previewData).forEach(key => {
       const regex = new RegExp(`{{${key}}}`, 'g');
       // @ts-ignore
       parsed = parsed.replace(regex, `<strong>${previewData[key]}</strong>`);
    });
    return parsed;
  };

  return (
    <div 
      className="bg-white w-[297mm] h-[210mm] shadow-2xl relative flex flex-col p-12 overflow-hidden shrink-0 transform-origin-top transition-transform duration-200"
      style={{ transform: `scale(${zoomLevel / 100})`, marginBottom: `-${210 * (1 - zoomLevel / 100)}mm` }}
    >
       
       {/* MARCA D'ÁGUA - Centralizada no fundo (aparece em ambas as páginas se desejar, ou só frente, aplicaremos só na frente) */}
       {formData.hasWatermark && formData.watermarkText && page === 'frente' && (
         <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden w-full h-full pointer-events-none opacity-[0.03]">
           <div 
             className="text-slate-900 font-black whitespace-nowrap uppercase transform -rotate-45 select-none" 
             style={{ fontSize: '140px', letterSpacing: '0.1em' }}
           >
             {formData.watermarkText}
           </div>
         </div>
       )}

       {page === 'frente' ? (
         // DESIGN FRENTE 
         <>
           {/* Bordas Ornamentais */}
           <div className="absolute inset-4 border-8 border-double border-slate-300 rounded-sm pointer-events-none z-10"></div>
           <div className="absolute inset-8 border border-slate-200 rounded-sm pointer-events-none z-10"></div>

           <div className="relative z-10 flex-1 flex flex-col items-center">
              
              {/* Header */}
              <div className="text-center mt-8 mb-12">
                <div className="w-24 h-24 bg-[#001a33] rounded-full mx-auto mb-6 flex items-center justify-center border-4 border-slate-200">
                   <span className="text-white text-3xl font-black">L</span>
                </div>
                <h1 className="text-5xl font-black text-[#001a33] uppercase tracking-tighter" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Certificado
                </h1>
                <p className="text-sm font-bold text-slate-500 uppercase tracking-[0.3em] mt-2">
                  De Conclusão de Curso
                </p>
              </div>

              {/* Corpo do Texto */}
              <div className="max-w-4xl text-center px-12 text-slate-800 leading-loose text-2xl font-serif">
                <div dangerouslySetInnerHTML={{ __html: parseText(formData.textoFrente || '') }} />
              </div>

              {/* Assinaturas */}
              <div className="mt-auto mb-12 flex justify-between w-full px-24">
                <div className="text-center">
                  <div className="w-64 border-b border-slate-800 pb-1 mb-2"></div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Diretor Geral</p>
                </div>
                <div className="text-center">
                  <div className="w-64 border-b border-slate-800 pb-1 mb-2"></div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Secretaria Acadêmica</p>
                </div>
              </div>

              {/* Data e Local */}
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest absolute bottom-8">
                Aracaju/SE, {previewData.data_conclusao}
              </div>
           </div>
         </>
       ) : (
         // DESIGN VERSO
         <>
           <div className="relative z-10 flex-1 flex">
             {/* Left Column - Histórico */}
             <div className="w-2/3 pr-12 border-r border-slate-300 flex flex-col">
               <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight border-b-2 border-slate-800 pb-2 mb-6">
                 Histórico Escolar
               </h2>
               <div className="text-sm text-slate-700 leading-relaxed font-mono whitespace-pre-wrap flex-1">
                 {/* Substitui grade_curricular mantendo nova linha caso use */}
                 <div dangerouslySetInnerHTML={{ __html: parseText(formData.textoVerso || '') }} />
               </div>
             </div>

             {/* Right Column - Registros & Validação */}
             <div className="w-1/3 pl-12 flex flex-col justify-between">
                <div>
                   <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight border-b-2 border-slate-800 pb-2 mb-6">
                     Registro
                   </h2>
                   <p className="text-xs font-bold text-slate-600 mb-2">Registrado sob o número:</p>
                   <p className="text-sm font-black text-slate-900 mb-6">1024-2026</p>
                   
                   <p className="text-xs font-bold text-slate-600 mb-2">Livro Especial:</p>
                   <p className="text-sm font-black text-slate-900 mb-6">{previewData.livro_registro}</p>
                </div>

                <div className="space-y-8">
                  {/* Validador QR Code */}
                  {formData.hasValidationQrCode && (
                    <div className="text-center bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                      <QrCode size={48} className="text-[#001a33] mb-3" />
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-relaxed">
                        VALIDAÇÃO INSTITUCIONAL
                      </p>
                      <p className="text-[10px] text-slate-600 mt-1">Aponte a câmera para verificar a autenticidade deste documento.</p>
                      <div className="mt-2 text-[10px] font-mono font-bold text-[#001a33] px-2 py-1 bg-white border border-slate-200 rounded">
                        ID: ABCD-1234-WXYZ-7890
                      </div>
                    </div>
                  )}

                  {/* Carimbo */}
                  <div className="text-center border-t border-slate-300 pt-8">
                    <div className="w-48 border-b-2 flex items-center justify-center border-slate-800 h-16 mb-2 mx-auto" style={{ borderStyle: 'dotted' }}>
                      <span className="text-[10px] text-slate-400 uppercase font-black opacity-50">Carimbo Institucional</span>
                    </div>
                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-4">Autorizado por</p>
                  </div>
                </div>
             </div>
           </div>
         </>
       )}
    </div>
  );
};

export default DiplomaPreview;

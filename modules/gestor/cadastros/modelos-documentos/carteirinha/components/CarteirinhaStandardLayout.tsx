import React from 'react';
import { User, CreditCard } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../../shared/document-validation/DocumentValidationQrCodeImage';
import type { CarteirinhaLayoutProps } from './carteirinha-preview.types';

export const CarteirinhaStandardLayout = ({ formData, page, studentData, showValidationQrCode, containerStyle, renderReadinessProps, customBackgroundUrl, ocultarDesign, institutionalText, codeValidador, assinaturaUrl, identity, getDocumentLabel, getDocumentDisplay, getPosStyle, handleDragStart, getDragBorderClass }: CarteirinhaLayoutProps) => {
  return (
    <div 
      className="carteirinha-render-root bg-white w-[85.6mm] h-[54mm] shadow-2xl relative flex flex-col rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200"
      style={containerStyle}
      {...renderReadinessProps}
    >
       {customBackgroundUrl && (
         <img
           src={customBackgroundUrl}
           alt=""
           aria-hidden="true"
           className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
           style={{ zIndex: 0 }}
         />
       )}
       {page === 'frente' ? (
          // DESIGN FRENTE 
          <>
            {/* Cabeçalho colorido (ocultado se selecionado design customizado) */}
            {!ocultarDesign && (
              <div 
                className="h-10 flex items-center justify-center shrink-0"
                style={{ backgroundColor: formData.corPrimaria, color: '#fff' }}
              >
                <h2 className="text-[12px] font-black uppercase tracking-widest">{formData.textoFrente || 'CIE - Documento do Estudante'}</h2>
              </div>
            )}

            <div className={`flex flex-1 relative ${ocultarDesign ? 'bg-transparent' : 'bg-white'}`}>
               {/* Coluna da Foto */}
               <div className="w-[22mm] h-full flex flex-col items-center justify-start py-2 px-2 border-r border-slate-100/30 z-10" style={{ backgroundColor: ocultarDesign ? 'transparent' : formData.corSecundaria + '20' }}>
                  <div className="w-[18mm] h-[24mm] bg-white border border-slate-300 flex items-center justify-center rounded overflow-hidden">
                     {/* Placeholder de Foto */}
                     {studentData.fotoUrl || (studentData as any).foto ? (
                       <img src={studentData.fotoUrl || (studentData as any).foto} alt="Foto do Aluno" className="w-full h-full object-cover" />
                     ) : (
                       <User size={32} className="text-slate-300" />
                     )}
                  </div>
                  {showValidationQrCode && (
                    <div className="mt-2 text-center w-full bg-slate-900 text-white rounded p-0.5">
                      <p className="text-[6px] font-black uppercase tracking-wider">
                        {studentData.validade.split('/')[2] || studentData.validade}
                      </p>
                    </div>
                  )}
               </div>

               {/* Coluna de Dados */}
               <div className="flex-1 py-2 px-3 pl-2 flex flex-col justify-between z-10">
                  <div>
                     <h3 className="text-[10px] font-black text-slate-800 uppercase leading-tight line-clamp-2">
                       {studentData.nome}
                     </h3>
                     
                     <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2">
                        <div>
                          {!identity.isCin && <>
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">CPF</p>
                          <p className="text-[7px] font-bold text-slate-800">{studentData.cpf}</p>
                          </>}
                        </div>
                        <div>
                          <p className="text-[5px] font-black text-slate-400 uppercase tracking-widest">{getDocumentLabel()}</p>
                          <p className="text-[7px] font-bold text-slate-800">{identity.number}</p>
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
                       <p className="text-[7px] font-bold text-slate-700 uppercase line-clamp-1">{studentData.instituicao}</p>
                     </div>
                  </div>
                  
                  <div className={`flex items-center justify-between border-t border-slate-200/50 pt-1 mt-1`}>
                    {showValidationQrCode && (
                      <p className="text-[6px] font-black" style={{ color: formData.corPrimaria }}>
                        {studentData.validade === 'Sem vencimento'
                          ? 'Sem vencimento'
                          : `Válida até ${studentData.validade}`}
                      </p>
                    )}
                    {formData.tipoCurso === 'Cursos Livres' && (
                      <span className="text-[5px] font-black bg-amber-100 text-amber-700 px-1 py-0.5 rounded uppercase">Uso Interno</span>
                    )}
                  </div>
               </div>

               {/* Coluna do QR Code na Frente */}
               {showValidationQrCode && (
               <div className="w-[18mm] h-full border-l border-slate-100/30 py-2 px-1 flex flex-col items-center justify-center text-center z-10" style={{ backgroundColor: ocultarDesign ? 'transparent' : formData.corSecundaria + '10' }}>
                  <DocumentValidationQrCodeImage
                    code={codeValidador}
                    alt="Validação QR"
                    className="mb-1 h-[13mm] w-[13mm] rounded bg-white p-0.5 shadow-sm"
                  />
                  <p className="text-[4px] font-black text-slate-500 uppercase tracking-widest leading-none">
                    VALIDAÇÃO<br/>DIGITAL
                  </p>
                  {formData.showValidationCode !== false && (
                    <p
                      className="mt-1 max-w-full break-all font-black leading-none"
                      style={{
                        color: formData.corCodigoValidacao || '#475569',
                        fontSize: `${formData.tamanhoFonteCodigoValidacao || 4.2}px`,
                      }}
                    >
                      {codeValidador}
                    </p>
                  )}
               </div>
               )}

               {/* Marca d'água super sutil (ocultada se selecionado design customizado) */}
               {!ocultarDesign && (
                 <div className="absolute inset-0 z-0 flex items-center justify-center opacity-5 pointer-events-none overflow-hidden">
                   <CreditCard size={120} style={{ color: formData.corPrimaria, transform: 'rotate(-20deg)' }} />
                 </div>
               )}
            </div>
          </>
        ) : (
          // DESIGN VERSO
          <>
            <div className={`flex-1 flex flex-col p-3 relative ${ocultarDesign ? 'bg-transparent' : 'bg-slate-50'}`}>
              
              {/* Textos legais e informações */}
              <div className={`flex-1 pr-12 text-[5.5px] text-slate-700 leading-relaxed text-justify whitespace-pre-wrap font-medium ${ocultarDesign ? '' : 'mt-6'}`}>
                {formData.textoVerso}
              </div>

              {formData.showInstitutionalData !== false && institutionalText && (
                <div
                  className="relative z-10 whitespace-pre-line font-bold leading-tight mt-1"
                  style={{
                    color: formData.corDadosInstitucionais || formData.corTextoVerso || '#1e293b',
                    fontSize: `${formData.tamanhoFonteDadosInstitucionais || 5.2}px`,
                    textAlign: formData.alinhamentoDadosInstitucionais || 'left',
                  }}
                >
                  {institutionalText}
                </div>
              )}

              {/* Footer do Verso */}
              <div className="border-t border-slate-300/30 pt-1 mt-1">
                <p className="text-[4px] font-bold text-slate-500 text-center uppercase">
                  Documento emitido digitalmente integrado ao sistema acadêmico
                </p>
              </div>

               {/* Tarja Magnética ou Barra de cor (estética - ocultada se selecionado design customizado) */}
               {!ocultarDesign && (
                 <div 
                   className="absolute top-0 left-0 right-0 h-4 bg-slate-800"
                 ></div>
               )}
            </div>
          </>
        )}
    </div>
  );
};

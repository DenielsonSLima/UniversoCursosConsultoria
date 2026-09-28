import React from 'react';
import { User } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../../shared/document-validation/DocumentValidationQrCodeImage';
import type { CarteirinhaLayoutProps } from './carteirinha-preview.types';

export const CarteirinhaAbsoluteLayout = ({ formData, page, studentData, showValidationQrCode, containerStyle, renderReadinessProps, customBackgroundUrl, ocultarDesign, institutionalText, codeValidador, assinaturaUrl, identity, getDocumentLabel, getDocumentDisplay, getPosStyle, handleDragStart, getDragBorderClass }: CarteirinhaLayoutProps) => {
    const corTexto = formData.corTexto || '#1e293b';
    const fontNome = `${formData.tamanhoFonteNome || 8.5}px`;
    const fontDados = `${formData.tamanhoFonteDados || 7.0}px`;
    const fontRotulo = '5px';
    const exibirRotulos = formData.exibirRotulos !== false;

    // Foto width/height em porcentagem
    const fw = `${formData.fotoWidth || 18.5}%`;
    const fh = `${formData.fotoHeight || 44.0}%`;

    // Formatação da Validade para MM/AAAA
    const validadeParts = studentData.validade.split('/');
    const validadeMesAno = validadeParts.length === 3 ? `${validadeParts[1]}/${validadeParts[2]}` : studentData.validade;

    return (
      <div 
        className="carteirinha-render-root bg-white w-[85.6mm] h-[54mm] shadow-2xl relative rounded-[2.5mm] overflow-hidden shrink-0 transform-origin-top transition-transform duration-200 select-none"
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
          // FRENTE - POSICIONAMENTO DINÂMICO ARRASTÁVEL
          <>
            {/* Foto 3x4 do Aluno */}
            <div 
              style={{ ...getPosStyle('foto'), width: fw, height: fh }}
              onMouseDown={(e) => handleDragStart(e, 'foto')}
              className={`bg-slate-50 border border-slate-200/50 flex items-center justify-center rounded-[0.8mm] overflow-hidden z-15 ${getDragBorderClass()}`}
            >
              {studentData.fotoUrl || (studentData as any).foto ? (
                <img src={studentData.fotoUrl || (studentData as any).foto} alt="Foto do Aluno" className="w-full h-full object-cover" />
              ) : (
                <User size={32} className="text-slate-300" />
              )}
            </div>

            {/* Nome do Aluno */}
            <div 
              style={getPosStyle('nome')}
              onMouseDown={(e) => handleDragStart(e, 'nome')}
              className={`w-[71%] h-[12%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>ALUNO:</span>
                  <span style={{ fontSize: fontNome, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.nome}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontNome, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.nome}</span>
              )}
            </div>

            {/* Curso */}
            <div 
              style={getPosStyle('curso')}
              onMouseDown={(e) => handleDragStart(e, 'curso')}
              className={`w-[71%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CURSO:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.curso}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900, textTransform: 'uppercase' }}>{studentData.curso}</span>
              )}
            </div>

            {/* RG */}
            <div 
              style={getPosStyle('rg')}
              onMouseDown={(e) => handleDragStart(e, 'rg')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{getDocumentLabel() ? `${getDocumentLabel()}:` : ''}</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{identity.number}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{getDocumentDisplay()}</span>
              )}
            </div>

            {/* Data de Nascimento */}
            <div 
              style={getPosStyle('nascimento')}
              onMouseDown={(e) => handleDragStart(e, 'nascimento')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>DATA DE NASCIMENTO:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.nascimento}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.nascimento}</span>
              )}
            </div>

            {/* CPF: CIN já utiliza o número nacional no campo de identidade. */}
            {!identity.isCin && <div 
              style={getPosStyle('cpf')}
              onMouseDown={(e) => handleDragStart(e, 'cpf')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col text-left leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CPF:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.cpf}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.cpf}</span>
              )}
            </div>}

            {/* Matrícula */}
            <div 
              style={getPosStyle('matricula')}
              onMouseDown={(e) => handleDragStart(e, 'matricula')}
              className={`w-[45%] h-[10%] flex items-center justify-start z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex items-center gap-1 leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>MATRÍCULA:</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.matricula}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 700 }}>{studentData.matricula}</span>
              )}
            </div>

            {/* QR Code de Validação Digital */}
            {showValidationQrCode && (
              <div
                style={getPosStyle('qrcode')}
                onMouseDown={(e) => handleDragStart(e, 'qrcode')}
                className={`w-[13%] h-[20.8%] bg-white p-[0.5mm] flex items-center justify-center rounded-[0.8mm] z-15 ${getDragBorderClass()}`}
              >
                <DocumentValidationQrCodeImage
                  code={codeValidador}
                  alt="QR"
                  className="h-full w-full"
                />
              </div>
            )}

            {/* Código textual para consulta quando a leitura do QR não for possível */}
            {showValidationQrCode && formData.showValidationCode !== false && (
              <div
                style={{
                  ...getPosStyle('codigoValidacao'),
                  color: formData.corCodigoValidacao || corTexto,
                  fontSize: `${formData.tamanhoFonteCodigoValidacao || 4.2}px`,
                }}
                onMouseDown={(e) => handleDragStart(e, 'codigoValidacao')}
                className={`w-[32%] text-center font-black tracking-[0.08em] z-15 whitespace-nowrap ${getDragBorderClass()}`}
              >
                {formData.rotuloCodigoValidacao || 'CÓD.:'} {codeValidador}
              </div>
            )}

            {/* Validade canônica do validador */}
            {showValidationQrCode && (
            <div
              style={getPosStyle('validade')}
              onMouseDown={(e) => handleDragStart(e, 'validade')}
              className={`w-[35%] h-[12%] flex items-center justify-center text-center z-15 ${getDragBorderClass()}`}
            >
              {exibirRotulos ? (
                <div className="flex flex-col items-center justify-center text-center leading-none">
                  <span style={{ fontSize: fontRotulo, color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>VALIDADE</span>
                  <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900 }}>{validadeMesAno}</span>
                </div>
              ) : (
                <span style={{ fontSize: fontDados, color: corTexto, fontWeight: 900 }}>{validadeMesAno}</span>
              )}
            </div>
            )}
          </>
        ) : (
          // VERSO - POSICIONAMENTO DINÂMICO E ARRASTÁVEL NO VERSO
          <>
            {/* Texto legal superior */}
            {formData.showTextoVerso !== false && (
              <div 
                style={{ 
                  ...getPosStyle('textoVerso'), 
                  color: formData.corTextoVerso || '#1e293b',
                  fontSize: `${formData.tamanhoFonteVerso || 5.0}px`,
                  textAlign: formData.alinhamentoTextoVerso || 'center'
                }}
                onMouseDown={(e) => handleDragStart(e, 'textoVerso')}
                className={`w-[90%] font-bold leading-normal tracking-wide z-15 whitespace-pre-wrap drop-shadow-sm ${getDragBorderClass()}`}
              >
                {formData.textoVerso || 'Esta Carteirinha é de Responsabilidade do Portador,\nPara uso Pessoal e Intransferível.'}
              </div>
            )}

            {/* Dados institucionais carregados automaticamente do polo */}
            {formData.showInstitutionalData !== false && institutionalText && (
              <div
                style={{
                  ...getPosStyle('dadosInstitucionais'),
                  color: formData.corDadosInstitucionais || formData.corTextoVerso || '#1e293b',
                  fontSize: `${formData.tamanhoFonteDadosInstitucionais || 5.2}px`,
                  textAlign: formData.alinhamentoDadosInstitucionais || 'left',
                }}
                onMouseDown={(e) => handleDragStart(e, 'dadosInstitucionais')}
                className={`w-[52%] font-bold leading-tight whitespace-pre-line z-15 ${getDragBorderClass()}`}
              >
                {institutionalText}
              </div>
            )}

            {/* Assinatura do Aluno */}
            {formData.showAssinaturaAluno !== false && (
              <div 
                style={{ ...getPosStyle('assinaturaAluno'), color: formData.corTextoVerso || '#475569' }}
                onMouseDown={(e) => handleDragStart(e, 'assinaturaAluno')}
                className={`w-[35%] text-center font-bold text-[5.5px] z-15 flex flex-col items-center justify-end ${getDragBorderClass()}`}
              >
                <div 
                  style={{ 
                    borderColor: formData.corTextoVerso || '#cbd5e1', 
                    borderTopWidth: '0.5px',
                    width: '100%'
                  }} 
                  className="pt-[1mm]"
                >
                  Assinatura do Aluno(a)
                </div>
              </div>
            )}

            {/* Assinatura do Diretor */}
            {formData.showAssinaturaDiretor !== false && (
              <div 
                style={{ ...getPosStyle('assinaturaDiretor'), color: formData.corTextoVerso || '#475569' }}
                onMouseDown={(e) => handleDragStart(e, 'assinaturaDiretor')}
                className={`w-[35%] text-center font-bold text-[5.5px] z-14 flex flex-col items-center justify-end ${getDragBorderClass()}`}
              >
                <div 
                  style={{ 
                    borderColor: formData.corTextoVerso || '#cbd5e1', 
                    borderTopWidth: '0.5px',
                    width: '100%'
                  }} 
                  className="pt-[1mm]"
                >
                  {formData.textoDiretor || 'Assinatura do Diretor(a)'}
                </div>
              </div>
            )}

            {/* Imagem da Assinatura do Diretor */}
            {formData.showAssinaturaDiretor !== false && assinaturaUrl && (
              <div
                style={{ 
                  ...getPosStyle('assinaturaDiretorImagem'), 
                  width: `${formData.assinaturaDiretorWidth || 25.0}%`,
                  mixBlendMode: formData.mesclarAssinatura !== false ? 'multiply' : undefined
                }}
                onMouseDown={(e) => handleDragStart(e, 'assinaturaDiretorImagem')}
                className={`z-20 flex items-center justify-center pointer-events-auto ${getDragBorderClass()}`}
              >
                <img 
                  src={assinaturaUrl} 
                  alt="Assinatura Diretor" 
                  className="w-full object-contain pointer-events-none" 
                  style={{ 
                    mixBlendMode: formData.mesclarAssinatura !== false ? 'multiply' : undefined,
                    maxHeight: '12mm'
                  }}
                />
              </div>
            )}

            {/* URL da Instituição / Validador */}
            {showValidationQrCode && formData.showSiteValidador !== false && (
              <div 
                style={{ 
                  ...getPosStyle('siteValidador'), 
                  color: formData.corTextoValidador || formData.corTextoVerso || '#1e293b',
                  fontSize: `${formData.tamanhoFonteValidador || 6.0}px`
                }}
                onMouseDown={(e) => handleDragStart(e, 'siteValidador')}
                className={`font-black tracking-wide z-15 ${getDragBorderClass()}`}
              >
                {formData.siteValidadorUrl || 'www.universocc.com.br'}
              </div>
            )}

            {/* Data de Emissão */}
            {formData.showDataEmissao !== false && (
              <div 
                style={{ 
                  ...getPosStyle('dataEmissao'), 
                  color: formData.corTextoEmissao || '#ef4444',
                  fontSize: `${formData.tamanhoFonteEmissao || 5.5}px`
                }}
                onMouseDown={(e) => handleDragStart(e, 'dataEmissao')}
                className={`font-bold tracking-wide z-15 flex items-center gap-1 ${getDragBorderClass()}`}
              >
                {formData.dataEmissaoTexto || 'EMISSÃO: 18/06/2026'}
              </div>
            )}
          </>
        )}
      </div>
    );
};

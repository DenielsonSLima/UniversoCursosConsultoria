import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff, KeyRound, ShieldCheck, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateNfseCache } from '../../../emissor-nfse/queries/nfse-cache';
import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';
import { useNfseStudentsDialog } from '../../../emissor-nfse/preparar/useNfseStudentsDialog';
import { uploadNfseCertificate } from '../../../emissor-nfse/services/configuration/certificate-upload.service';
import './nfse-certificate-modal.css';

interface Props { scope: NfseScope; onClose: () => void; onSaved: (result: { expiresAt: string }) => void }

export default function NfseCertificateModal({ scope,onClose,onSaved }: Props) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [showPassword,setShowPassword]=useState(false);
  const submitting=useRef(false);
  const passwordInput=useRef<HTMLInputElement>(null);
  const requestId=useRef(crypto.randomUUID());
  const client=useQueryClient();
  const close=()=>{
    if (submitting.current) return;
    if (passwordInput.current) passwordInput.current.value='';
    onClose();
  };
  const {overlayRef,dialogRef,initialFocusRef}=useNfseStudentsDialog(close);
  useEffect(()=>{
    const input=passwordInput.current;
    return ()=>{if (input) input.value='';};
  },[]);
  useEffect(()=>{if (error && !busy) passwordInput.current?.focus();},[error,busy]);

  const save=async(event: FormEvent)=>{
    event.preventDefault(); event.stopPropagation();
    if (submitting.current) return;
    const file=initialFocusRef.current?.files?.[0];
    if (!file || !passwordInput.current) {setError('Selecione o arquivo do certificado A1.'); return;}
    submitting.current=true;
    setBusy(true); setError(''); setShowPassword(false);
    try {
      const result=await uploadNfseCertificate(scope,file,passwordInput.current.value,requestId.current);
      await invalidateNfseCache(client,scope,'configuration');
      onSaved(result);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Não foi possível cadastrar o certificado.');
    } finally {
      if (passwordInput.current) passwordInput.current.value='';
      submitting.current=false; setBusy(false);
    }
  };

  return createPortal(
    <div ref={overlayRef} className="config-dialog-overlay nfse-certificate-modal" role="presentation">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="nfse-a1-title"
        aria-describedby="nfse-a1-description" tabIndex={-1} className="config-dialog nfse-certificate-dialog">
        <header className="config-dialog-header nfse-certificate-header">
          <div className="nfse-certificate-title">
            <span className="nfse-certificate-icon"><KeyRound size={20} aria-hidden="true" /></span>
            <div><h2 id="nfse-a1-title">Cadastrar certificado A1</h2>
              <p id="nfse-a1-description">Selecione o arquivo e informe a senha do certificado.</p>
            </div>
          </div>
          <button type="button" className="nfse-certificate-close" onClick={close} disabled={busy} aria-label="Fechar cadastro de certificado">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <form onSubmit={event=>void save(event)}>
          <div className="config-dialog-body nfse-certificate-body">
            <fieldset disabled={busy}>
              <label className="nfse-certificate-field"><span>Arquivo do certificado A1</span>
                <input ref={initialFocusRef} type="file" accept=".pfx,.p12,application/x-pkcs12" required
                  aria-describedby="nfse-a1-file-help" onChange={()=>{
                    requestId.current=crypto.randomUUID(); setError(''); setShowPassword(false);
                    if (passwordInput.current) passwordInput.current.value='';
                  }} />
                <small id="nfse-a1-file-help">Arquivo PFX ou P12, até 128 KB. Use o certificado da unidade definida na configuração.</small>
              </label>
              <div className="nfse-certificate-field">
                <label htmlFor="nfse-a1-password">Senha do certificado</label>
                <div className="nfse-certificate-password">
                  <input id="nfse-a1-password" ref={passwordInput} type={showPassword?'text':'password'}
                    maxLength={1024} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    placeholder="Digite a senha do arquivo" aria-describedby="nfse-a1-password-help"
                    onChange={()=>setError('')} />
                  <button type="button" className="nfse-portal-button" aria-controls="nfse-a1-password"
                    aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>
                    {showPassword?<EyeOff size={17} aria-hidden="true" />:<Eye size={17} aria-hidden="true" />}
                    {showPassword?'Ocultar senha':'Mostrar senha'}
                  </button>
                </div>
                <small id="nfse-a1-password-help">Use a mesma senha do arquivo, incluindo espaços e acentos. Se não houver senha, deixe em branco.</small>
              </div>
            </fieldset>
            {error && <div className="nfse-certificate-error" role="alert">{error}</div>}
            <div className="nfse-certificate-security">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>A senha é usada apenas para abrir o arquivo. O material de assinatura fica no cofre do servidor. Após salvar, a validade aparecerá no painel.</p>
            </div>
            <p className="nfse-certificate-help">Cadastrar o certificado não libera a emissão. Revogação, representação e habilitação fiscal ainda precisam ser verificadas.</p>
          </div>
          <footer className="config-dialog-footer nfse-certificate-footer">
            <button type="button" className="nfse-portal-button" disabled={busy} onClick={close}>Cancelar</button>
            <button type="submit" className="nfse-portal-button" data-primary="true" disabled={busy}>
              {busy?'Validando certificado…':'Salvar certificado'}
            </button>
          </footer>
        </form>
      </div>
    </div>,document.body,
  );
}

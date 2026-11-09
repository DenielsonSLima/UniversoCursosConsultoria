import { useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { NfseScope } from '../../../emissor-nfse/types/nfse.types';
import { useNfseStudentsDialog } from '../../../emissor-nfse/preparar/useNfseStudentsDialog';
import { uploadNfseCertificate } from '../../../emissor-nfse/services/configuration/certificate-upload.service';

interface Props { scope: NfseScope; onClose: () => void; onSaved: () => void }

export default function NfseCertificateModal({ scope,onClose,onSaved }: Props) {
  const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const passwordInput=useRef<HTMLInputElement>(null);
  const requestId=useRef(crypto.randomUUID()); const client=useQueryClient();
  const {overlayRef,dialogRef,initialFocusRef}=useNfseStudentsDialog(()=>{if (!busy) onClose();});
  const save=async(event: FormEvent)=>{
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    const file=initialFocusRef.current?.files?.[0]; if (!file || !passwordInput.current) return;
    setBusy(true); setError('');
    try {
      await uploadNfseCertificate(scope,file,passwordInput.current.value,requestId.current);
      await client.invalidateQueries({queryKey:['nfse-configuration-metadata',scope.contextKey,scope.poloId,scope.environment]});
      onSaved();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Não foi possível cadastrar o certificado.');}
    finally {if (passwordInput.current) passwordInput.current.value=''; setBusy(false);}
  };
  return createPortal(<div ref={overlayRef} className="nfse-portal fixed inset-0 z-[10000] flex items-center justify-center bg-[#001a33]/60 p-4"
    role="presentation"><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="nfse-a1-title" tabIndex={-1}
      className="w-full max-w-lg rounded-xl bg-white p-5 text-sm shadow-xl"><form onSubmit={event=>void save(event)}>
      <h2 id="nfse-a1-title" className="mb-4 text-lg font-semibold">Cadastrar certificado A1</h2>
      <p className="mb-4">Use o certificado do estabelecimento definido como origem na configuração. A validade e a cadeia serão conferidas; a habilitação para emitir continuará pendente.</p>
      <fieldset disabled={busy} className="grid gap-4">
        <label className="nfse-field"><span>Arquivo A1 · PFX/P12 · até 128 KB</span>
          <input ref={initialFocusRef} type="file" accept=".pfx,.p12,application/x-pkcs12" required
            onChange={()=>{requestId.current=crypto.randomUUID(); setError('');}} /></label>
        <label className="nfse-field"><span>Senha do certificado</span><input ref={passwordInput} type="password"
          maxLength={1024} autoComplete="off" /></label>
      </fieldset>
      {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
      <p className="mt-4 text-xs text-slate-600">A senha será usada apenas para abrir o arquivo. O material de assinatura ficará no cofre do servidor. A situação de revogação e os poderes de representação exigem validação adicional.</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="nfse-portal-button" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="nfse-portal-button" data-primary="true" disabled={busy}>{busy?'Conferindo…':'Cadastrar certificado'}</button>
      </div>
    </form></div></div>,document.body);
}

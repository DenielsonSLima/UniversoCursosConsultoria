import React, { useState, useEffect, useRef } from 'react';
import { Save, Edit2, Camera, CheckCircle2, Loader2, User } from 'lucide-react';
import { parceirosService } from '../../../parceiros.service';
import { formatCpf } from '../../../../../../lib/documentFormatters';
import { RACA_COR_OPTIONS } from '../../../utils/parceiros.constants';
import { canCorrectPendingPartnerEmail } from '../../../partner-email-update';
import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import { UFS } from '../../formularioparceiros/professor/professor-form.model';
import './professor-dados.css';

interface ParceiroProfessorDadosProps {
  data: any;
  onChange: (data: any) => Promise<unknown>;
  onPhotoUploaded?: (fotoUrl: string, professor: any) => void;
  onPhotoUploadError?: (message: string) => void;
}

const DisplayField = ({ label, value, wide = false }: { label: string; value: any; wide?: boolean }) => (
  <div className={`professor-dados-field ${wide ? 'professor-dados-wide' : ''}`}>
    <span>{label}</span>
    <p>{value || <span className="professor-dados-empty">Não informado</span>}</p>
  </div>
);
const poloLocation = (polo: any) => [polo?.cidade, polo?.uf || polo?.estado].filter(Boolean).join(' / ');

const ParceiroProfessorDados: React.FC<ParceiroProfessorDadosProps> = ({ data, onChange, onPhotoUploaded, onPhotoUploadError }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(data);
  const [polosList, setPolosList] = useState<any[]>([]);
  const [polosError, setPolosError] = useState('');
  const [polosLoading, setPolosLoading] = useState(true);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const saving = useRef(false);
  const hasLinkedAccess = Boolean(data.authUserId || formData.authUserId);
  const emailReadOnly = hasLinkedAccess && !canCorrectPendingPartnerEmail(data);

  useEffect(() => {
    if (!isEditing) setFormData(data);
  }, [data, isEditing]);

  useEffect(() => {
    let active = true;
    parceirosService.getPolos().then((polos) => {
      if (active) setPolosList(polos);
    }).catch(() => {
      if (active) setPolosError('Não foi possível carregar as unidades vinculadas.');
    }).finally(() => { if (active) setPolosLoading(false); });
    return () => { active = false; };
  }, []);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isSaving || isUploadingPhoto) return;
    setIsUploadingPhoto(true);
    try {
      const url = await parceirosService.uploadProfilePhoto(data.id, formData, file);
      const nextData = { ...formData, foto: url };
      setFormData(nextData);
      onPhotoUploaded?.(url, nextData);
    } catch (error: any) {
      onPhotoUploadError?.(error?.message || 'Erro ao enviar foto.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = event.target;
    if (name === 'email' && emailReadOnly) return;
    let finalValue = type === 'text' && name !== 'email' ? value.toUpperCase() : value;
    if (name === 'cpf') finalValue = value.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2');
    if (name === 'cep') finalValue = value.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
    if (name === 'telefone') finalValue = value.replace(/\D/g, '').slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    setFormData((previous: any) => ({
      ...previous,
      [name]: finalValue,
      ...(name === 'nome' ? { nomeCompleto: finalValue } : {}),
      ...(name === 'telefone' ? { contato1: finalValue } : {}),
    }));
  };

  const handleSave = async () => {
    if (saving.current || isUploadingPhoto) return;
    saving.current = true;
    setIsSaving(true);
    setSaveError('');
    try {
      await onChange(formData);
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar. Seus dados continuam em edição.');
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };

  const togglePolo = (poloId: string) => {
    setFormData((previous: any) => {
      const current = previous.poloIds || [];
      const next = current.includes(poloId) ? current.filter((id: string) => id !== poloId) : [...current, poloId];
      return { ...previous, poloIds: next, poloId: next[0] || '' };
    });
  };

  return (
    <div className="professor-dados">
      <section>
        <div className="professor-dados-header">
          <h3>Dados pessoais</h3>
          {!isEditing && <button type="button" onClick={() => { setSaveError(''); setIsEditing(true); }}><Edit2 size={14} /> Editar</button>}
        </div>
        <div className="professor-dados-personal">
          <div className="professor-dados-photo">
            <div className="professor-dados-avatar">
              {formData.foto ? <img src={formData.foto} alt="Professor" className="h-full w-full object-cover" /> : (
                <div className="flex h-full w-full items-center justify-center text-slate-400"><User size={36} /></div>
              )}
              {isUploadingPhoto && <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><Loader2 size={24} className="animate-spin" /></div>}
            </div>
            {isEditing && <>
              <label><Camera size={14} /> Alterar foto<input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={isUploadingPhoto || isSaving} /></label>
              {formData.foto && <button type="button" className="professor-dados-link" disabled={isSaving || isUploadingPhoto} onClick={() => setFormData((previous: any) => ({ ...previous, foto: '' }))}>Remover</button>}
            </>}
          </div>
          <div className="professor-dados-fields">
            {isEditing ? (
              <fieldset disabled={isSaving} className="professor-dados-grid professor-dados-grid--edit">
                <div>
                  <label htmlFor="professor-nome">Nome completo</label>
                  <input id="professor-nome" type="text" name="nome" value={formData.nome || ''} onChange={handleChange} />
                </div>
                <div>
                  <div className="professor-dados-label-row"><label htmlFor="professor-nome-social">Nome social</label><button type="button" className="professor-dados-link" onClick={() => setFormData((previous: any) => ({ ...previous, nomeSocial: previous.nome }))}>Usar completo</button></div>
                  <input id="professor-nome-social" type="text" name="nomeSocial" value={formData.nomeSocial || ''} onChange={handleChange} placeholder="Como prefere ser chamado" />
                </div>
                <div>
                  <label htmlFor="professor-cpf">CPF</label>
                  <input id="professor-cpf" type="text" name="cpf" inputMode="numeric" maxLength={14} value={formData.cpf || ''} onChange={handleChange} />
                </div>
                <div>
                  <label htmlFor="professor-telefone">Telefone</label>
                  <input id="professor-telefone" type="text" name="telefone" inputMode="tel" value={formData.telefone || ''} onChange={handleChange} />
                </div>
                <div>
                  <label htmlFor="professor-raca">Raça/cor</label>
                  <InstitutionalSelect id="professor-raca" ariaLabel="Raça/cor" value={formData.racaCor || ''} onValueChange={(racaCor) => setFormData((previous: any) => ({ ...previous, racaCor }))} options={[{ value: '', label: 'Não informado' }, ...RACA_COR_OPTIONS.map((value) => ({ value, label: value }))]} />
                </div>
                <div className="professor-dados-wide">
                  <label htmlFor="professor-email">E-mail</label>
                  {hasLinkedAccess && <p className="professor-dados-help">{emailReadOnly ? 'O e-mail de acesso já existente será preservado.' : 'Ao salvar, o e-mail do primeiro acesso será corrigido e um novo link será enviado.'}</p>}
                  <input id="professor-email" type="email" name="email" value={formData.email || ''} onChange={handleChange} readOnly={emailReadOnly} disabled={isSaving} />
                </div>
              </fieldset>
            ) : (
              <div className="professor-dados-grid">
                <DisplayField label="Nome completo" value={formData.nome} wide />
                <DisplayField label="Nome social" value={formData.nomeSocial || formData.nome} />
                <DisplayField label="CPF" value={formatCpf(formData.cpf)} />
                <DisplayField label="Telefone" value={formData.telefone} />
                <DisplayField label="Raça/cor" value={formData.racaCor} />
                <DisplayField label="E-mail" value={formData.email} wide />
              </div>
            )}
          </div>
        </div>
      </section>

      <section>
        <h3>Polos / vínculos de unidade</h3>
        {polosLoading && <p className="professor-dados-help" role="status">Carregando unidades…</p>}
        {polosError && <p className="professor-dados-help" role="alert">{polosError}</p>}
        {isEditing ? <>
          <p className="professor-dados-help">Selecione uma ou mais unidades.</p>
          <fieldset disabled={isSaving || polosLoading || Boolean(polosError)} className="professor-dados-polos">
            {polosList.map((polo) => {
              const selected = (formData.poloIds || []).includes(polo.id);
              return <button type="button" key={polo.id} className="professor-dados-polo" aria-pressed={selected} onClick={() => togglePolo(polo.id)}>
                <span>{polo.nome}<small>{poloLocation(polo)}</small></span>{selected && <CheckCircle2 size={16} className="shrink-0" />}
              </button>;
            })}
          </fieldset>
        </> : (
          (formData.poloIds || []).length > 0 ? <div className="professor-dados-polos">
            {formData.poloIds.map((id: string) => {
              const polo = polosList.find((item) => item.id === id);
              return <div key={id} className="professor-dados-polo"><span>{polo?.nome || 'Unidade vinculada'}{poloLocation(polo) && <small>{poloLocation(polo)}</small>}</span></div>;
            })}
          </div> : <p className="professor-dados-help">Nenhum polo vinculado</p>
        )}
      </section>

      <section>
        <div className="professor-dados-header"><h3>Endereço</h3></div>
        {isEditing ? (
          <fieldset disabled={isSaving} className="professor-dados-grid">
            <div><label htmlFor="professor-cep">CEP</label><input id="professor-cep" type="text" name="cep" inputMode="numeric" maxLength={9} value={formData.cep || ''} onChange={handleChange} /></div>
            <div className="professor-dados-wide"><label htmlFor="professor-endereco">Rua / avenida</label><input id="professor-endereco" type="text" name="endereco" value={formData.endereco || ''} onChange={handleChange} /></div>
            <div><label htmlFor="professor-bairro">Bairro</label><input id="professor-bairro" type="text" name="bairro" value={formData.bairro || ''} onChange={handleChange} /></div>
            <div><label htmlFor="professor-cidade">Cidade</label><input id="professor-cidade" type="text" name="cidade" value={formData.cidade || ''} onChange={handleChange} /></div>
            <div><label htmlFor="professor-uf">Estado</label><InstitutionalSelect id="professor-uf" ariaLabel="Estado" value={formData.uf || formData.estado || ''} onValueChange={(uf) => setFormData((previous: any) => ({ ...previous, uf }))} options={[{ value: '', label: 'Não informado' }, ...UFS.map((value) => ({ value, label: value }))]} /></div>
          </fieldset>
        ) : (
          <div className="professor-dados-grid">
            <DisplayField label="CEP" value={formData.cep} /><DisplayField label="Endereço" value={formData.endereco} wide />
            <DisplayField label="Bairro" value={formData.bairro} /><DisplayField label="Cidade" value={formData.cidade} /><DisplayField label="Estado" value={formData.uf || formData.estado} />
          </div>
        )}
      </section>
      {saveError && <p role="alert" className="mt-4 text-sm text-red-700">{saveError}</p>}
      {isEditing && <div className="professor-dados-actions">
        <button type="button" disabled={isSaving || isUploadingPhoto} onClick={() => { setFormData(data); setSaveError(''); setIsEditing(false); }}>Cancelar</button>
        <button type="button" className="professor-dados-primary" onClick={handleSave} disabled={isSaving || isUploadingPhoto}>
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {isSaving ? 'Salvando…' : 'Salvar Alterações'}
        </button>
      </div>}
    </div>
  );
};

export default ParceiroProfessorDados;

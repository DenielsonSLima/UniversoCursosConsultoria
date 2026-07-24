import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Globe2, Mail, MapPin, RefreshCw, Save, UserCircle } from 'lucide-react';
import ProfilePhotoEditor, {
  createCroppedProfilePhoto,
  defaultProfilePhotoTransform,
  ProfilePhotoTransform,
} from './ProfilePhotoEditor';
import { whatsappService } from './whatsapp.service';
import { WhatsAppBusinessProfile } from './whatsapp.types';

const emptyProfile: WhatsAppBusinessProfile = {
  about: '',
  address: '',
  description: '',
  email: '',
  websites: [''],
  vertical: 'EDU',
  profilePictureUrl: null,
};

const categories = [
  { value: 'EDU', label: 'Educação' },
  { value: 'PROF_SERVICES', label: 'Serviços profissionais' },
  { value: 'OTHER', label: 'Outro' },
  { value: 'RETAIL', label: 'Varejo' },
  { value: 'FINANCE', label: 'Financeiro' },
  { value: 'HEALTH', label: 'Saúde' },
  { value: 'NONPROFIT', label: 'Sem fins lucrativos' },
];

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const normalizeProfile = (profile?: WhatsAppBusinessProfile | null): WhatsAppBusinessProfile => ({
  ...emptyProfile,
  ...profile,
  websites: profile?.websites?.length ? profile.websites : [''],
  vertical: categories.some((category) => category.value === profile?.vertical) ? profile!.vertical : 'EDU',
});

const WhatsAppProfilePanel: React.FC<{ apiReady: boolean; connectionId: string; connectionName: string }> = ({
  apiReady,
  connectionId,
  connectionName,
}) => {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<WhatsAppBusinessProfile>(emptyProfile);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoTransform, setPhotoTransform] = useState<ProfilePhotoTransform>(defaultProfilePhotoTransform);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['whatsapp', connectionId, 'perfil-meta'],
    queryFn: () => whatsappService.getBusinessProfile(connectionId),
    enabled: apiReady,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (data) setProfile(normalizeProfile(data));
  }, [data]);

  const previewUrl = useMemo(() => (
    photoFile ? URL.createObjectURL(photoFile) : profile.profilePictureUrl
  ), [photoFile, profile.profilePictureUrl]);

  useEffect(() => () => {
    if (photoFile && previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
  }, [photoFile, previewUrl]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const croppedPhoto = photoFile
        ? await createCroppedProfilePhoto(photoFile, photoTransform)
        : null;
      const photo = croppedPhoto
        ? { base64: await fileToBase64(croppedPhoto), type: croppedPhoto.type, name: croppedPhoto.name }
        : null;
      const cleaned: WhatsAppBusinessProfile = {
        ...profile,
        websites: profile.websites.map((site) => site.trim()).filter(Boolean),
      };
      return whatsappService.saveBusinessProfile({ connectionId, profile: cleaned, photo });
    },
    onSuccess: (fresh) => {
      setPhotoFile(null);
      setPhotoTransform(defaultProfilePhotoTransform);
      setProfile(normalizeProfile(fresh));
      setMessage({ tone: 'ok', text: 'Perfil WhatsApp salvo na Meta.' });
      queryClient.invalidateQueries({ queryKey: ['whatsapp', connectionId, 'perfil-meta'] });
    },
    onError: (error: any) => {
      setMessage({ tone: 'error', text: error?.message || 'Não foi possível salvar o perfil na Meta.' });
    },
  });

  const update = (field: keyof WhatsAppBusinessProfile, value: string) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const updateWebsite = (index: number, value: string) => {
    setProfile((current) => ({
      ...current,
      websites: current.websites.map((site, siteIndex) => siteIndex === index ? value : site),
    }));
  };

  const addWebsite = () => {
    setProfile((current) => ({ ...current, websites: [...current.websites, ''] }));
  };

  const reload = async () => {
    setMessage(null);
    const result = await refetch();
    if (result.error) {
      setMessage({ tone: 'error', text: result.error.message });
    } else {
      setMessage({ tone: 'ok', text: 'Perfil recarregado da Meta.' });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 custom-scrollbar">
      <div className="max-w-6xl space-y-5">
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <UserCircle size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold tracking-tight text-[#001a33]">Perfil de {connectionName}</h3>
              <p className="mt-1 text-sm font-medium text-slate-500">Foto e dados públicos exclusivos desta linha no WhatsApp Business.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={reload} disabled={!apiReady || isFetching} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wide text-slate-600 transition-colors hover:border-emerald-200 hover:text-emerald-700 disabled:opacity-40">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
              Recarregar da Meta
            </button>
            <button onClick={() => saveMutation.mutate()} disabled={!apiReady || saveMutation.isPending} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-emerald-700 disabled:opacity-40">
              {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar na Meta
            </button>
          </div>
        </section>

        {!apiReady && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            Configure a API Meta Cloud antes de editar o perfil público.
          </div>
        )}

        {message && (
          <div className={`rounded-xl border p-4 text-sm font-semibold ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            {message.text}
          </div>
        )}

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-[#001a33]">Foto atual do perfil</p>
            <div className="mt-5 flex flex-col items-center text-center">
              <div className="h-32 w-32 overflow-hidden rounded-full bg-emerald-50 ring-8 ring-slate-50">
                {previewUrl ? (
                  <img src={previewUrl} alt="Foto do perfil WhatsApp" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-4xl font-black text-emerald-700">UC</div>
                )}
              </div>
              <label className="mt-5 inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl bg-[#001a33] px-4 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-blue-900">
                <Camera size={14} />
                Trocar foto
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(event) => {
                    setPhotoFile(event.target.files?.[0] || null);
                    setPhotoTransform(defaultProfilePhotoTransform);
                    setMessage(null);
                    event.target.value = '';
                  }}
                />
              </label>
              <p className="mt-3 text-xs font-medium leading-relaxed text-slate-500">
                Use imagem quadrada em JPG ou PNG. A troca depende do upload aceito pela Meta.
              </p>
              {photoFile && (
                <ProfilePhotoEditor
                  file={photoFile}
                  transform={photoTransform}
                  onChange={setPhotoTransform}
                />
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Sobre/recado" value={profile.about} onChange={(value) => update('about', value)} />
              <Field label="Categoria" value={profile.vertical} onChange={(value) => update('vertical', value)} options={categories} />
              <Field label="E-mail" value={profile.email} onChange={(value) => update('email', value)} icon={Mail} />
              <Field label="Endereço" value={profile.address} onChange={(value) => update('address', value)} icon={MapPin} />
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Descrição da escola</span>
              <textarea value={profile.description} onChange={(event) => update('description', event.target.value)} className="mt-2 h-28 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-relaxed text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white" />
            </label>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Site</span>
                <button type="button" onClick={addWebsite} className="text-xs font-bold text-emerald-700">Adicionar site</button>
              </div>
              {profile.websites.map((site, index) => (
                <label key={index} className="relative block">
                  <Globe2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={site} onChange={(event) => updateWebsite(index, event.target.value)} placeholder="https://universocc.com.br" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white" />
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ElementType;
  options?: Array<{ value: string; label: string }>;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, icon: Icon, options }) => (
  <label className="block">
    <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
    <div className="relative mt-2">
      {Icon && <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />}
      {options ? (
        <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white">
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className={`h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pr-4 text-sm font-semibold text-slate-700 outline-none transition-all focus:border-emerald-500 focus:bg-white ${Icon ? 'pl-10' : 'pl-3'}`} />
      )}
    </div>
  </label>
);

export default WhatsAppProfilePanel;

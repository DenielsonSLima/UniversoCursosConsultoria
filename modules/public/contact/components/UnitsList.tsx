import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  Clock3,
  ExternalLink,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { contactService } from '../contact.service';
import type { PublicUnit, PublicUnitSchedule } from '../contact.types';

const WEEK_DAYS = [
  ['1', 'Segunda'],
  ['2', 'Terça'],
  ['3', 'Quarta'],
  ['4', 'Quinta'],
  ['5', 'Sexta'],
  ['6', 'Sábado'],
  ['0', 'Domingo'],
] as const;

const titleCase = (value: string) =>
  value
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|[\s/-])([\p{L}])/gu, (_match, separator, letter) => `${separator}${letter.toLocaleUpperCase('pt-BR')}`);

const splitPhones = (phone: string | null) =>
  (phone || '')
    .split(/\s*(?:\/|;|\||\n)\s*/)
    .map((value) => value.trim())
    .filter(Boolean);

const getWhatsAppNumber = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
};

const formatPublicPhone = (phone: string) => phone.trim().startsWith('+55') ? phone : `+55 ${phone}`;

const getUnitLabel = (unit: PublicUnit) => {
  const city = titleCase(unit.city || unit.name);
  return unit.isMatrix ? `Unidade ${city} · Matriz` : `Unidade ${city}`;
};

const getAddressLines = (unit: PublicUnit) => {
  const street = [unit.address, unit.number].filter(Boolean).join(', ');
  const location = [unit.city ? titleCase(unit.city) : '', unit.state?.toLocaleUpperCase('pt-BR')]
    .filter(Boolean)
    .join(' · ');

  return [
    street,
    unit.complement,
    unit.district ? titleCase(unit.district) : '',
    unit.postalCode ? `CEP ${unit.postalCode}` : '',
    location,
  ].filter(Boolean);
};

const getMapsUrl = (unit: PublicUnit) => {
  const query = getAddressLines(unit).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
};

const formatSchedule = (schedule: PublicUnitSchedule | null) => {
  if (!schedule) return [];

  const activeDays = WEEK_DAYS.flatMap(([id, label]) => {
    const rule = schedule[id];
    return rule?.ativo && rule.inicio && rule.fim
      ? [{ label, time: `${rule.inicio} às ${rule.fim}` }]
      : [];
  });

  return activeDays.reduce<Array<{ label: string; time: string }>>((groups, day) => {
    const previous = groups.at(-1);
    if (!previous || previous.time !== day.time) {
      groups.push({ ...day });
      return groups;
    }

    const firstDay = previous.label.split(' a ')[0];
    previous.label = `${firstDay} a ${day.label}`;
    return groups;
  }, []);
};

const UnitCard = ({ unit }: { unit: PublicUnit; key?: React.Key }) => {
  const addressLines = getAddressLines(unit);
  const mapsUrl = getMapsUrl(unit);
  const phones = splitPhones(unit.phone);
  const whatsapp = phones.length ? getWhatsAppNumber(phones[0]) : null;
  const hours = formatSchedule(unit.supportHours);

  return (
    <article className="group overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_60px_-38px_rgba(0,26,51,0.55)] transition duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_30px_70px_-38px_rgba(37,99,235,0.45)]">
      <div className="relative h-48 overflow-hidden bg-[#001a33]">
        <iframe
          src={`https://maps.google.com/maps?q=${encodeURIComponent(addressLines.join(', '))}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
          className="h-full w-full scale-[1.03] border-0 grayscale-[15%] transition duration-700 group-hover:scale-110"
          loading="lazy"
          title={`Mapa de ${getUnitLabel(unit)}`}
          tabIndex={-1}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#001a33] via-[#001a33]/30 to-transparent" />
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex items-end justify-between gap-4 p-6 text-white outline-none ring-inset focus-visible:ring-4 focus-visible:ring-blue-400"
          aria-label={`Abrir ${getUnitLabel(unit)} no Google Maps`}
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-200">
              {unit.isMatrix ? 'Sede principal' : 'Atendimento presencial'}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">{getUnitLabel(unit)}</h2>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <ExternalLink size={18} />
          </span>
        </a>
      </div>

      <div className="grid gap-6 p-6 sm:p-7">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <MapPin size={19} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Localização</p>
            <div className="mt-2 space-y-1">
              {addressLines.map((line) => (
                <p key={line} className="text-sm font-semibold leading-5 text-slate-700">{line}</p>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2">
          <div className="flex gap-3">
            <Phone className="mt-0.5 shrink-0 text-blue-600" size={18} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Contato</p>
              {phones.length ? phones.map((phone) => {
                const number = getWhatsAppNumber(phone);
                return number ? (
                  <a
                    key={phone}
                    href={`https://wa.me/${number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1.5 text-sm font-black text-[#001a33] hover:text-blue-600"
                  >
                    <MessageCircle size={14} /> {formatPublicPhone(phone)}
                  </a>
                ) : (
                  <a key={phone} href={`tel:${phone.replace(/\D/g, '')}`} className="mt-1 block text-sm font-black text-[#001a33] hover:text-blue-600">
                    {formatPublicPhone(phone)}
                  </a>
                );
              }) : <p className="mt-1 text-sm font-semibold text-slate-500">Consulte pelo atendimento central</p>}
              {unit.email ? (
                <a href={`mailto:${unit.email}`} className="mt-1 flex items-center gap-1.5 break-all text-xs font-bold text-slate-500 hover:text-blue-600">
                  <Mail size={13} /> {unit.email}
                </a>
              ) : null}
            </div>
          </div>

          <div className="flex gap-3">
            <Clock3 className="mt-0.5 shrink-0 text-blue-600" size={18} />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Funcionamento</p>
              {hours.length ? hours.map((range) => (
                <p key={`${range.label}-${range.time}`} className="mt-1 text-sm font-semibold text-slate-700">
                  <span className="font-black text-[#001a33]">{range.label}:</span> {range.time}
                </p>
              )) : <p className="mt-1 text-sm font-semibold text-slate-500">Horário sob consulta</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-blue-200 transition hover:bg-[#001a33]"
            >
              <MessageCircle size={17} />
              Falar com esta unidade
            </a>
          ) : (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-xs font-black uppercase tracking-[0.14em] text-white"
            >
              <MapPin size={17} /> Ver localização
            </a>
          )}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 text-xs font-black uppercase tracking-[0.12em] text-[#001a33] transition hover:border-blue-300 hover:bg-blue-50"
          >
            Como chegar <ExternalLink size={15} />
          </a>
        </div>
      </div>
    </article>
  );
};

const UnitsList: React.FC = () => {
  const { data: units = [], isLoading, isError } = useQuery({
    queryKey: ['public', 'contact', 'units'],
    queryFn: contactService.listPublicUnits,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-80 items-center justify-center rounded-[2rem] border border-slate-200 bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto animate-spin text-blue-600" size={30} />
          <p className="mt-3 text-sm font-bold text-slate-500">Carregando unidades...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[2rem] border border-rose-200 bg-white p-8 text-center">
        <AlertCircle className="mx-auto text-rose-500" size={30} />
        <h2 className="mt-3 text-lg font-black text-[#001a33]">Não foi possível carregar as unidades</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Tente novamente em alguns instantes.</p>
      </div>
    );
  }

  if (!units.length) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center">
        <Building2 className="mx-auto text-blue-600" size={32} />
        <h2 className="mt-3 text-lg font-black text-[#001a33]">Unidades em atualização</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">Os canais de atendimento serão publicados em breve.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-7 lg:grid-cols-2">
      {units.map((unit) => <UnitCard key={unit.id} unit={unit} />)}
    </div>
  );
};

export default UnitsList;

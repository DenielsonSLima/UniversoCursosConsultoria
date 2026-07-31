import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Award,
  BookOpen,
  ExternalLink,
  Globe,
  GraduationCap,
  Instagram,
  Laptop,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  School,
  Share2,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';

type CourseLink = {
  id: string;
  title: string;
  description: string;
  action: string;
  url: string;
  image: string;
  icon: LucideIcon;
};

type OfficialLink = {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
  isExternal?: boolean;
};

const PHONE_NUMBERS = [
  {
    label: 'WhatsApp e atendimento principal',
    number: '(79) 99602-8316',
    raw: '+5579996028316',
  },
  {
    label: 'Telefone de atendimento',
    number: '(79) 99861-7614',
    raw: '+5579998617614',
  },
];

const COURSE_LINKS: CourseLink[] = [
  {
    id: 'tecnicos',
    title: 'Cursos Técnicos',
    description: 'Formações para entrar no mercado com preparo, prática e segurança.',
    action: 'Ver cursos técnicos',
    url: '/cursos-tecnicos',
    image: '/bio-hero.webp',
    icon: Zap,
  },
  {
    id: 'ead',
    title: 'Cursos EAD',
    description: 'Estude de onde estiver, no seu ritmo e com suporte.',
    action: 'Explorar cursos EAD',
    url: '/ead',
    image: '/course-covers/ead/atendente-de-farmacia.webp',
    icon: Laptop,
  },
  {
    id: 'superior',
    title: 'Ensino Superior',
    description: 'Graduações para construir uma carreira com novas possibilidades.',
    action: 'Conhecer graduações',
    url: '/ensino-superior',
    image: '/bio-ensino-superior.webp',
    icon: School,
  },
  {
    id: 'especializacao',
    title: 'Pós e Especializações',
    description: 'Conhecimento avançado para evoluir profissionalmente.',
    action: 'Ver especializações',
    url: '/especializacao',
    image: '/course-covers/ead/educacao-e-gestao-escolar.webp',
    icon: Award,
  },
  {
    id: 'livres',
    title: 'Cursos Livres',
    description: 'Capacitações práticas para desenvolver novas habilidades.',
    action: 'Encontrar cursos livres',
    url: '/cursos-livres',
    image: '/course-covers/ead/operador-de-caixa.webp',
    icon: BookOpen,
  },
];

const OFFICIAL_LINKS: OfficialLink[] = [
  {
    id: 'aluno',
    title: 'Portal do Aluno',
    description: 'Entrar no ambiente virtual',
    url: '/login',
    icon: GraduationCap,
  },
  {
    id: 'site',
    title: 'Conheça a Universo',
    description: 'Visitar o site institucional',
    url: '/',
    icon: Globe,
  },
  {
    id: 'instagram',
    title: 'Instagram',
    description: '@universocursoseconsultoria',
    url: 'https://www.instagram.com/universocursoseconsultoria/',
    icon: Instagram,
    isExternal: true,
  },
];

const WHATSAPP_URL =
  'https://wa.me/5579996028316?text=Ol%C3%A1!%20Vim%20pelo%20Instagram%20e%20gostaria%20de%20informa%C3%A7%C3%B5es%20sobre%20os%20cursos.';

const CourseCard: React.FC<{ course: CourseLink }> = ({ course }) => {
  const Icon = course.icon;

  return (
    <Link
      to={course.url}
      className="group relative block h-full overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,35,60,0.06)] transition duration-300 hover:border-blue-200 hover:shadow-[0_16px_38px_rgba(37,99,235,0.11)] focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 motion-safe:hover:-translate-y-0.5"
    >
      <article className="relative min-h-[168px] h-full overflow-hidden">
        <div
          className="absolute inset-y-0 right-0 w-[44%] overflow-hidden"
          style={{
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, transparent 8%, rgba(0, 0, 0, 0.18) 28%, black 68%, black 100%)',
            maskImage:
              'linear-gradient(to right, transparent 0%, transparent 8%, rgba(0, 0, 0, 0.18) 28%, black 68%, black 100%)',
          }}
        >
          <img
            src={course.image}
            alt=""
            width={640}
            height={420}
            loading="lazy"
            className="h-full w-full object-cover transition duration-700 motion-safe:group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/10 via-transparent to-white/5" />
        </div>

        <div className="relative z-10 flex min-h-[168px] w-[60%] flex-col items-start p-5 sm:w-[58%]">
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition-colors duration-300 group-hover:bg-blue-600 group-hover:text-white">
            <Icon size={19} strokeWidth={2.1} />
          </span>
          <h3 className="text-[17px] font-extrabold tracking-tight text-slate-950">
            {course.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-relaxed text-slate-500">
            {course.description}
          </p>
          <span className="mt-auto flex items-center gap-1.5 pt-3 text-[11px] font-extrabold text-blue-700">
            {course.action}
            <ArrowUpRight size={14} />
          </span>
        </div>
      </article>
    </Link>
  );
};

const OfficialAccess: React.FC<{ item: OfficialLink }> = ({ item }) => {
  const Icon = item.icon;
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 transition group-hover:border-blue-600 group-hover:bg-blue-600 group-hover:text-white">
        <Icon size={19} strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-extrabold text-slate-900">{item.title}</span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-500">
          {item.description}
        </span>
      </span>
      {item.isExternal ? (
        <ExternalLink
          size={15}
          className="shrink-0 text-slate-400 transition group-hover:text-blue-600"
        />
      ) : (
        <ArrowUpRight
          size={16}
          className="shrink-0 text-slate-400 transition group-hover:text-blue-600"
        />
      )}
    </>
  );

  const className =
    'group flex min-h-[76px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,35,60,0.05)] transition hover:border-blue-200 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200';

  if (item.isExternal) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {content}
        <span className="sr-only">(abre em uma nova guia)</span>
      </a>
    );
  }

  return (
    <Link to={item.url} className={className}>
      {content}
    </Link>
  );
};

const BioPage: React.FC = () => {
  const [showPhoneNumbers, setShowPhoneNumbers] = useState(false);
  const [shareStatus, setShareStatus] = useState<'copied' | 'error' | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    },
    [],
  );

  const showShareStatus = (status: 'copied' | 'error') => {
    setShareStatus(status);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => setShareStatus(null), 2400);
  };

  const handleShare = async () => {
    const canonicalUrl = `${window.location.origin}/links`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Universo Cursos e Consultoria',
          text: 'Cursos, atendimento e acessos oficiais da Universo.',
          url: canonicalUrl,
        });
        return;
      } catch (error: unknown) {
        const errorName =
          typeof error === 'object' && error !== null && 'name' in error
            ? String(error.name)
            : '';
        if (errorName === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(canonicalUrl);
      showShareStatus('copied');
    } catch {
      showShareStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-slate-900 selection:bg-blue-600 selection:text-white">
      <header className="relative z-30 border-b border-slate-200/80 bg-white">
        <div className="flex h-[3px] w-full" aria-hidden="true">
          <span className="w-[18%] bg-red-600" />
          <span className="flex-1 bg-blue-700" />
        </div>
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5 sm:h-[72px] sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
            aria-label="Ir para o site da Universo Cursos e Consultoria"
          >
            <img
              src="/LogoUniverso.png"
              alt="Universo Cursos e Consultoria"
              width={210}
              height={58}
              className="h-9 w-auto object-contain sm:h-10"
            />
            <span className="hidden h-7 w-px bg-slate-200 sm:block" />
            <span className="hidden text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500 sm:block">
              Links oficiais
            </span>
          </Link>

          <div className="relative">
            {shareStatus ? (
              <span
                role="status"
                className={`absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg px-3 py-2 text-[11px] font-bold text-white shadow-xl ${
                  shareStatus === 'copied' ? 'bg-slate-900' : 'bg-red-600'
                }`}
              >
                {shareStatus === 'copied' ? 'Link copiado' : 'Não foi possível compartilhar'}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleShare}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-95"
              aria-label="Compartilhar esta página"
              title="Compartilhar"
            >
              <Share2 size={18} />
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-[#001a33] text-white">
          <div
            className="absolute inset-y-0 right-0 w-full opacity-50 sm:w-[68%] sm:opacity-90 md:w-[60%]"
            style={{
              WebkitMaskImage:
                'linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.12) 18%, black 58%, black 100%)',
              maskImage:
                'linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.12) 18%, black 58%, black 100%)',
            }}
          >
            <img
              src="/bio-hero.webp"
              alt=""
              width={1024}
              height={1024}
              fetchPriority="high"
              className="h-full w-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-[#05294f]/25" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#001a33] via-[#03274a]/95 to-[#0b3b76]/35" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-300/30 to-transparent" />

          <div className="relative mx-auto flex min-h-[350px] w-full max-w-5xl flex-col justify-center px-5 pb-20 pt-11 sm:min-h-[382px] sm:px-8 sm:pb-24 sm:pt-14">
            <div className="max-w-[88%] sm:max-w-[62%]">
              <div className="mb-5 flex items-center gap-3">
                <span className="h-[2px] w-10 bg-red-500" />
                <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-blue-100">
                  Formação que abre caminhos
                </span>
              </div>

              <h1 className="max-w-2xl text-[36px] font-black leading-[1.02] tracking-[-0.045em] text-white sm:text-[48px]">
                <span className="block">Seu próximo passo</span>
                <span className="relative mt-1 inline-block">
                  começa aqui.
                  <span
                    className="absolute -bottom-2 left-0 h-[3px] w-16 bg-red-500"
                    aria-hidden="true"
                  />
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-[14px] font-medium leading-relaxed text-blue-100/85 sm:text-[15px]">
                Cursos, atendimento e acessos oficiais para você escolher com segurança.
              </p>

              <p className="mt-5 flex items-start gap-2 text-[12px] font-semibold text-blue-100/80 sm:items-center sm:text-[13px]">
                <MapPin size={15} className="mt-0.5 shrink-0 text-red-400 sm:mt-0" />
                Japoatã <span aria-hidden="true">•</span> Aquidabã{' '}
                <span aria-hidden="true">•</span> Porto da Folha — SE
              </p>
            </div>

            <dl className="mt-8 grid max-w-xl grid-cols-3 border-t border-white/15 pt-5">
              <div className="pr-3">
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-200/65">
                  Experiência
                </dt>
                <dd className="mt-1 text-[13px] font-extrabold text-white sm:text-[14px]">
                  Desde 2011
                </dd>
              </div>
              <div className="border-l border-white/15 px-3 sm:px-5">
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-200/65">
                  Presença
                </dt>
                <dd className="mt-1 text-[13px] font-extrabold text-white sm:text-[14px]">
                  3 unidades
                </dd>
              </div>
              <div className="border-l border-white/15 pl-3 sm:pl-5">
                <dt className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-200/65">
                  Modalidades
                </dt>
                <dd className="mt-1 text-[13px] font-extrabold text-white sm:text-[14px]">
                  Presencial + EAD
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <div className="relative z-20 mx-auto w-full max-w-5xl px-5 sm:px-8">
          <section
            aria-labelledby="atendimento-title"
            className="-mt-12 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,35,60,0.14)]"
          >
            <div className="flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <MessageCircle size={23} />
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id="atendimento-title"
                      className="text-[14px] font-black text-slate-950"
                    >
                      Fale com a Universo
                    </h2>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[11px] font-extrabold text-blue-700">
                      <ShieldCheck size={12} />
                      Canal oficial
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium text-slate-500">
                    Escolha um canal oficial de atendimento.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 md:min-w-[350px]">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_8px_20px_rgba(5,150,105,0.18)] transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200 active:scale-[0.98]"
                >
                  <MessageCircle size={17} />
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => setShowPhoneNumbers((current) => !current)}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[13px] font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)] transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.98]"
                  aria-expanded={showPhoneNumbers}
                  aria-controls="bio-phone-list"
                >
                  <PhoneCall size={17} />
                  {showPhoneNumbers ? 'Ocultar' : 'Telefones'}
                </button>
              </div>
            </div>

            {showPhoneNumbers ? (
              <div
                id="bio-phone-list"
                className="grid gap-2 border-t border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-2 sm:p-5 motion-safe:animate-fadeIn"
              >
                {PHONE_NUMBERS.map((phone) => (
                  <a
                    key={phone.raw}
                    href={`tel:${phone.raw}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-blue-200 hover:shadow-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                  >
                    <span>
                      <span className="block text-[11px] font-bold text-slate-500">
                        {phone.label}
                      </span>
                      <span className="mt-0.5 block text-[14px] font-extrabold text-slate-900">
                        {phone.number}
                      </span>
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                      <Phone size={15} />
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </section>
        </div>

        <section className="mx-auto w-full max-w-5xl px-5 pb-14 pt-12 sm:px-8 sm:pt-14">
          <div className="mb-7">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
              Formações
            </span>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950 sm:text-[28px]">
              Escolha onde quer chegar
            </h2>
            <p className="mt-2 max-w-xl text-[13px] font-medium leading-relaxed text-slate-500">
              Encontre a modalidade que combina com seus planos e conheça as opções
              disponíveis.
            </p>
          </div>

          <nav aria-label="Formações oferecidas pela Universo">
            <ul className="grid gap-4 md:grid-cols-2">
              {COURSE_LINKS.map((course, index) => (
                <li
                  key={course.id}
                  className={
                    index === COURSE_LINKS.length - 1
                      ? 'h-full md:col-span-2 md:mx-auto md:w-[calc(50%-0.5rem)]'
                      : 'h-full'
                  }
                >
                  <CourseCard course={course} />
                </li>
              ))}
            </ul>
          </nav>
        </section>

        <section className="border-y border-slate-200/80 bg-white/55">
          <div className="mx-auto w-full max-w-5xl px-5 py-11 sm:px-8">
            <div className="mb-5">
              <span className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
                Canais e sistemas
              </span>
              <h2
                id="official-access-title"
                className="mt-1.5 text-xl font-black tracking-tight text-slate-950"
              >
                Acessos oficiais
              </h2>
            </div>

            <nav aria-labelledby="official-access-title">
              <ul className="grid gap-3 md:grid-cols-3">
                {OFFICIAL_LINKS.map((item) => (
                  <li key={item.id}>
                    <OfficialAccess item={item} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
      </main>

      <footer className="bg-[#001a33] text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 px-5 py-7 text-center sm:px-8 md:flex-row md:text-left">
          <div>
            <p className="text-[13px] font-extrabold">Universo Cursos e Consultoria</p>
            <p className="mt-1 text-[11px] font-medium text-slate-400">
              Transformando vidas através da educação.
            </p>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
            © {new Date().getFullYear()} Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default BioPage;

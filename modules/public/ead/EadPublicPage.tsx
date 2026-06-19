import React, { useEffect } from 'react';
import { ArrowUpRight, BookOpen, CheckCircle2, Clock, Laptop } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const EAD_URL = 'https://universocursos.curso.study/loja_virtual/index.php';

const EadPublicPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      <main className="flex-grow">
        <section className="relative overflow-hidden bg-[#001a33] px-6 py-20 text-white md:py-28">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.35),_transparent_45%)]" />
          <div className="container relative mx-auto max-w-6xl">
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-300">
              <Laptop size={16} /> Educação a distância
            </span>
            <h1 className="max-w-3xl text-4xl font-black uppercase tracking-tight md:text-6xl">
              Cursos EAD para estudar no seu ritmo
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              Encontre formações on-line com flexibilidade, suporte e acesso a uma plataforma preparada para sua evolução profissional.
            </p>
            <a
              href={EAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-3 rounded-2xl bg-blue-600 px-7 py-4 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-blue-950/40 transition hover:-translate-y-0.5 hover:bg-blue-500"
            >
              Ver catálogo de cursos EAD <ArrowUpRight size={18} />
            </a>
          </div>
        </section>

        <section className="container mx-auto grid max-w-6xl gap-6 px-6 py-16 md:grid-cols-3">
          {[
            { icon: Clock, title: 'Flexibilidade', text: 'Organize seus estudos de acordo com sua rotina.' },
            { icon: BookOpen, title: 'Formação prática', text: 'Conteúdos voltados ao desenvolvimento profissional.' },
            { icon: CheckCircle2, title: 'Acesso simples', text: 'Escolha seu curso e continue a matrícula na plataforma EAD.' },
          ].map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Icon size={24} />
              </div>
              <h2 className="text-lg font-black text-[#001a33]">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
            </article>
          ))}
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default EadPublicPage;

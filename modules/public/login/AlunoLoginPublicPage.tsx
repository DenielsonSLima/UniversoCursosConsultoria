import React, { useEffect } from 'react';
import { ArrowUpRight, FileText, GraduationCap, ShieldCheck, UserRound } from 'lucide-react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const PROESC_LOGIN_URL = 'https://app.proesc.com/universo-cursos-e-consultoria/login';

const AlunoLoginPublicPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Header />

      <main className="flex flex-grow items-center px-6 py-16">
        <div className="container mx-auto grid max-w-6xl overflow-hidden rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl shadow-slate-900/10 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="bg-[#001a33] p-9 text-white md:p-14">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-300">
              <GraduationCap size={16} /> Área do aluno
            </span>
            <h1 className="mt-6 text-4xl font-black uppercase tracking-tight md:text-5xl">
              Acesse seu portal acadêmico
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
              Consulte informações acadêmicas, documentos e serviços disponíveis para alunos da Universo Cursos e Consultoria.
            </p>

            <div className="mt-10 space-y-4">
              {[
                { icon: FileText, text: 'Acompanhe informações e documentos acadêmicos' },
                { icon: UserRound, text: 'Use os dados de acesso fornecidos pela instituição' },
                { icon: ShieldCheck, text: 'Ambiente externo seguro do sistema acadêmico Proesc' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                  <Icon size={18} className="shrink-0 text-blue-400" />
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col justify-center p-9 md:p-14">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <UserRound size={30} />
            </div>
            <h2 className="text-2xl font-black text-[#001a33]">Login do aluno</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Ao continuar, você será encaminhado ao portal acadêmico oficial da instituição.
            </p>
            <a
              href={PROESC_LOGIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-7 inline-flex items-center justify-center gap-3 rounded-2xl bg-blue-600 px-6 py-4 text-sm font-black uppercase tracking-widest text-white transition hover:bg-blue-700"
            >
              Entrar no portal <ArrowUpRight size={18} />
            </a>
            <a href="/contato" className="mt-4 text-center text-sm font-bold text-slate-500 hover:text-blue-600">
              Precisa de ajuda com o acesso? Fale conosco
            </a>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AlunoLoginPublicPage;

import React, { useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const CookiesPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <Header />

      <div className="bg-[#001a33] py-16 text-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="mb-4 text-3xl font-black uppercase tracking-tighter md:text-5xl">
            Política de <span className="text-blue-400">Cookies</span>
          </h1>
          <p className="mx-auto max-w-2xl text-blue-100">
            Saiba como utilizamos cookies para manter o site seguro e melhorar sua experiência.
          </p>
        </div>
      </div>

      <main className="container mx-auto max-w-4xl flex-grow px-6 py-12 leading-relaxed text-slate-700">
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-xl font-bold uppercase tracking-tight text-[#001a33]">1. O que são cookies</h2>
            <p>
              Cookies são pequenos arquivos armazenados no navegador durante a visita ao site. Eles permitem reconhecer preferências, manter funcionalidades e compreender como as páginas são utilizadas.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold uppercase tracking-tight text-[#001a33]">2. Como utilizamos</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Essenciais:</strong> necessários para segurança, navegação e funcionamento do site;</li>
              <li><strong>Preferências:</strong> preservam escolhas feitas durante a utilização dos serviços;</li>
              <li><strong>Desempenho e análise:</strong> ajudam a compreender acessos e melhorar conteúdos e páginas.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold uppercase tracking-tight text-[#001a33]">3. Cookies de terceiros</h2>
            <p>
              Alguns recursos podem utilizar serviços externos, como ferramentas de análise, mapas, vídeos ou links para redes sociais. Esses fornecedores podem aplicar suas próprias políticas de cookies e privacidade.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold uppercase tracking-tight text-[#001a33]">4. Gerenciamento</h2>
            <p>
              Você pode bloquear ou excluir cookies nas configurações do navegador. A desativação de cookies essenciais, entretanto, pode comprometer o funcionamento de algumas áreas do site.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-xl font-bold uppercase tracking-tight text-[#001a33]">5. Atualizações e contato</h2>
            <p>
              Esta política pode ser atualizada para refletir mudanças técnicas ou legais. Em caso de dúvidas, entre em contato pelo e-mail universo.cursoseconsultoria@gmail.com.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CookiesPage;

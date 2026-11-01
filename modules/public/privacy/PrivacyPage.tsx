
import React, { useEffect } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const PrivacyPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Header />
      
      <div className="bg-[#001a33] py-16 text-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter mb-4">
            Política de Privacidade <span className="text-blue-400">(LGPD)</span>
          </h1>
          <p className="text-blue-100 max-w-2xl mx-auto">
            Entenda como coletamos, usamos e protegemos seus dados.
          </p>
          <p className="mt-3 text-sm text-blue-200">Versão de 31 de outubro de 2026</p>
        </div>
      </div>

      <main className="flex-grow container mx-auto px-6 py-12 max-w-4xl text-slate-700 leading-relaxed">
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">1. Introdução</h2>
            <p>
              Esta política descreve o tratamento de dados nos serviços da Universo Cursos e Consultoria. A identificação da instituição e da unidade responsáveis pela sua matrícula consta do contrato educacional. Para informações sobre o controlador responsável pelo seu atendimento ou para exercer seus direitos, utilize o canal indicado ao final desta página.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">2. Coleta de Dados</h2>
            <p className="mb-2">Coletamos informações pessoais que você nos fornece voluntariamente ao:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Preencher formulários de contato ou matrícula;</li>
              <li>Utilizar nossos canais de atendimento e comunicação;</li>
              <li>Acessar nossa área do aluno ou portal do gestor.</li>
            </ul>
            <p className="mt-2">Conforme o serviço, os dados podem incluir identificação, CPF, contatos, endereço, fotografia, filiação, responsável legal ou financeiro, sexo, raça/cor por autodeclaração, dados acadêmicos, pagamentos e informações bancárias necessárias ao vínculo. Também podem ser tratados registros de acesso, dispositivo, mensagens e arquivos enviados ao atendimento.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">2.1. Saúde, acessibilidade e responsáveis</h2>
            <p>
              Informações sobre deficiência e necessidades de acessibilidade e comprovantes de vacinação podem ser solicitados quando necessários ao atendimento educacional ou a exigências do curso e do campo de estágio. São dados sensíveis: sua coleta deve se limitar ao necessário, com acesso às pessoas responsáveis por essa finalidade e hipótese legal específica, como cumprimento de obrigação legal ou regulatória ou consentimento específico, quando aplicável.
            </p>
            <p className="mt-2">
              Dados de crianças e adolescentes, quando tratados, exigem atenção ao seu melhor interesse, à representação legal e às informações adequadas à idade. A finalidade educacional não autoriza divulgação pública de informações de saúde, uso publicitário ou consentimento genérico para outros usos.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">2.2. Raça/cor e sexo no cadastro</h2>
            <p>
              A informação de raça/cor é solicitada por autodeclaração. O cadastro exige a seleção de uma opção, inclusive “Prefiro não informar”, que registra a ausência de declaração. A informação de raça/cor é dado pessoal sensível nos termos da LGPD.
            </p>
            <p className="mt-2">
              Esses dados são utilizados somente para registros educacionais, atendimento a obrigações legais e regulatórias e indicadores de inclusão. Não são usados para publicidade, e o acesso é restrito às pessoas autorizadas para essas finalidades.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">3. Uso das Informações</h2>
            <p>Utilizamos seus dados para:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Processar matrículas e emitir certificados;</li>
              <li>Comunicar informações sobre cursos e aulas;</li>
              <li>Melhorar nossos serviços e atendimento;</li>
              <li>Cumprir obrigações legais e regulatórias.</li>
            </ul>
            <p className="mt-2">A hipótese legal depende da operação: execução do contrato e procedimentos solicitados pelo titular, obrigações legais ou regulatórias, exercício regular de direitos e, quando pertinente, consentimento específico. O legítimo interesse é avaliado para finalidades compatíveis, com necessidade e balanceamento, e não é autorização genérica para tratar dados sensíveis.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">4. Proteção de Dados</h2>
            <p>
              A proteção envolve autenticação, permissões por atribuição e unidade, restrição de acesso a documentos e medidas de segurança no armazenamento e na transmissão. O acesso a uma funcionalidade deve se limitar às informações necessárias ao trabalho ou ao atendimento do próprio titular. Comunique ao nosso canal qualquer suspeita de acesso indevido.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">5. Compartilhamento</h2>
            <p>
              Não vendemos dados pessoais. Conforme o serviço utilizado, há compartilhamento com órgãos educacionais e reguladores, instituições financeiras e operadores de pagamento para cobrança e conciliação, sistemas de gestão acadêmica e fornecedores de hospedagem, banco de dados, autenticação e notificações. Integrações do sistema incluem Supabase, hospedagem Vercel, Proesc, Banese e Asaas, além de Firebase e Meta/WhatsApp nos recursos correspondentes. Cada compartilhamento deve ter finalidade definida e se limitar aos dados necessários.
            </p>
            <p className="mt-2">Serviços externos podem envolver tratamento ou acesso fora do Brasil. Quando houver transferência internacional, sua utilização depende de mecanismo e garantias aplicáveis à operação. Informações sobre destinatários e sobre a operação relacionada aos seus dados podem ser solicitadas pelo canal de privacidade.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">5.1. Transcrição de áudio por inteligência artificial</h2>
            <p>A transcrição de áudios do WhatsApp pela OpenAI é um recurso opcional, bloqueado por padrão até aprovação institucional documentada da finalidade, hipótese legal, condições do fornecedor, conservação e eventual transferência internacional. Quando habilitado, o atendente recebe aviso e confirma o envio do áudio completo antes da operação. O texto gerado é apresentado na visualização, sem criar uma nova cópia de transcrição no histórico do sistema. Essa confirmação operacional não substitui a hipótese legal nem o consentimento do titular quando este for exigido.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">5.2. Conservação e término do tratamento</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Registros acadêmicos e documentos emitidos:</strong> conservados conforme as exigências educacionais e os períodos necessários à comprovação da formação e autenticidade documental.</li>
              <li><strong>Contratos, pagamentos e registros fiscais:</strong> conservados enquanto necessários à execução das obrigações, aos prazos legais e ao exercício regular de direitos.</li>
              <li><strong>Mensagens, anexos, fotos e dados de saúde:</strong> a conservação deve ser revista após o atendimento, substituição do arquivo ou término da finalidade. A conservação posterior exige justificativa compatível com a categoria do dado.</li>
              <li><strong>Registros de acesso e cópias de segurança:</strong> sujeitos às necessidades de segurança e recuperação e a ciclos próprios de conservação; eventual retenção deve ter acesso restrito e finalidade justificada.</li>
            </ul>
            <p className="mt-2">Ao término da necessidade e das hipóteses de conservação permitidas, os dados devem ser eliminados ou anonimizados de forma adequada. A exclusão de uma conta ou inativação de um cadastro pode não eliminar registros sujeitos a conservação obrigatória. Você pode solicitar os critérios e o prazo aplicável à sua categoria de dados.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">6. Direitos do Titular</h2>
            <p>
              O titular pode solicitar confirmação do tratamento, acesso, correção, portabilidade, anonimização, bloqueio ou eliminação de dados, além de informações sobre compartilhamento e revogação do consentimento, quando aplicável.
            </p>
            <p className="mt-2">Informe a relação com a instituição e o pedido desejado. Podemos solicitar somente as informações necessárias para confirmar sua identidade e evitar acesso por terceiros. A resposta deve esclarecer o atendimento, os registros sujeitos a conservação e os motivos de eventual limitação. Não envie senhas, tokens ou dados bancários completos na solicitação.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-[#001a33] mb-4 uppercase tracking-tight">7. Contato</h2>
            <p>
              Para dúvidas sobre esta política ou para exercer seus direitos de titular de dados, entre em contato pelo e-mail: universo.cursoseconsultoria@gmail.com
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPage;

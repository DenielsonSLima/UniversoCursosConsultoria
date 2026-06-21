
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Quote, Building2, CheckCircle2, ArrowRight } from 'lucide-react';
import LoginForm from './components/LoginForm';
import { loginService } from './login.service';
import { LoginCredentials } from './login.types';
import { supabase } from '../../lib/supabase';

const quotes = [
  { text: "A educação é a arma mais poderosa que você pode usar para mudar o mundo.", author: "Nelson Mandela" },
  { text: "O investimento em conhecimento rende os melhores juros.", author: "Benjamin Franklin" },
  { text: "Aprender é a única coisa de que a mente nunca se cansa, nunca tem medo e nunca se arrepende.", author: "Leonardo da Vinci" },
  { text: "A educação tem raízes amargas, mas os seus frutos são doces.", author: "Aristóteles" },
  { text: "O ser humano é aquilo que a educação faz dele.", author: "Immanuel Kant" },
  { text: "Educação não transforma o mundo. Educação muda as pessoas. Pessoas transformam o mundo.", author: "Paulo Freire" },
  { text: "O conhecimento é a chave que abre todas as portas.", author: "Autor Desconhecido" },
];

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dailyQuote, setDailyQuote] = useState(quotes[0]);

  // States para seleção de Polo do Professor
  const [loginStep, setLoginStep] = useState<'credentials' | 'polo_select'>('credentials');
  const [professorPolos, setProfessorPolos] = useState<{ id: string; nome: string }[]>([]);
  const [professorName, setProfessorName] = useState('');
  const [selectedPoloId, setSelectedPoloId] = useState('');
  const [professorId, setProfessorId] = useState('');
  const [professorEmail, setProfessorEmail] = useState('');

  // Atualiza o relógio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Seleciona uma frase aleatória ao montar o componente
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    setDailyQuote(randomQuote);

    return () => clearInterval(timer);
  }, []);

  const handleLogin = async (credentials: LoginCredentials) => {
    setIsLoading(true);
    
    try {
      const email = credentials.email.toLowerCase();
      const password = credentials.password;

      // 1. Tentar buscar no banco se existe um parceiro com esse e-mail
      const { data: partner } = await supabase
        .from('parceiros')
        .select('id, nome, tipo, polo_id, polo_ids')
        .eq('email', email)
        .maybeSingle();

      if (partner) {
        if (partner.tipo === 'Professor') {
          const poloIds = partner.polo_ids || [];
          if (poloIds.length > 1) {
            // Buscar nomes dos polos
            const { data: polosData } = await supabase
              .from('polos')
              .select('id, nome')
              .in('id', poloIds);

            if (polosData && polosData.length > 1) {
              setProfessorPolos(polosData);
              setProfessorName(partner.nome);
              setProfessorId(partner.id);
              setProfessorEmail(email);
              setSelectedPoloId(polosData[0].id);
              setLoginStep('polo_select');
              setIsLoading(false);
              return;
            }
          }
          
          // Se tiver 1 ou 0 polos vinculados, loga direto salvando o único polo
          const activePolo = poloIds[0] || '44444444-4444-4444-4444-444444444444';
          sessionStorage.setItem('active_polo_id', activePolo);
          sessionStorage.setItem('logged_user_id', partner.id);
          sessionStorage.setItem('logged_user_name', partner.nome);
          sessionStorage.setItem('logged_user_email', email);
          sessionStorage.setItem('logged_user_tipo', 'Professor');
          navigate('/professor');
          return;
        }

        if (partner.tipo === 'Aluno') {
          sessionStorage.setItem('active_polo_id', partner.polo_id || '44444444-4444-4444-4444-444444444444');
          sessionStorage.setItem('logged_user_id', partner.id);
          sessionStorage.setItem('logged_user_name', partner.nome);
          sessionStorage.setItem('logged_user_email', email);
          sessionStorage.setItem('logged_user_tipo', 'Aluno');
          navigate('/aluno');
          return;
        }
      }

      // Lógica de Acesso Provisória (Hardcoded para demonstração)
      if (email === 'gestor@universo.com' && password === '123456') {
        sessionStorage.setItem('active_polo_id', '44444444-4444-4444-4444-444444444444');
        sessionStorage.setItem('logged_user_id', 'f1111111-1111-1111-1111-111111111111');
        sessionStorage.setItem('logged_user_name', 'Administrador Master');
        sessionStorage.setItem('logged_user_email', email);
        sessionStorage.setItem('logged_user_tipo', 'Gestor');
        navigate('/gestor');
        return;
      }

      // Fallback para outros perfis (baseado apenas no email por enquanto)
      if (email.includes('professor')) {
        sessionStorage.setItem('active_polo_id', '44444444-4444-4444-4444-444444444444');
        sessionStorage.setItem('logged_user_id', 'b0000000-0000-0000-0000-000000000001'); // Prof. Carlos Silva's ID
        sessionStorage.setItem('logged_user_name', 'Prof. Carlos Silva (Demonstração)');
        sessionStorage.setItem('logged_user_email', 'carlos.silva@email.com');
        sessionStorage.setItem('logged_user_tipo', 'Professor');
        navigate('/professor');
      } else if (email.includes('aluno')) {
        sessionStorage.setItem('active_polo_id', '44444444-4444-4444-4444-444444444444');
        sessionStorage.setItem('logged_user_id', 'a0000000-0000-0000-0000-000000000001'); // Ana Clara Souza's id
        sessionStorage.setItem('logged_user_name', 'Ana Clara Souza (Demonstração)');
        sessionStorage.setItem('logged_user_email', 'anaclara@email.com');
        sessionStorage.setItem('logged_user_tipo', 'Aluno');
        navigate('/aluno');
      } else if (email.includes('gestor')) {
        sessionStorage.setItem('active_polo_id', '44444444-4444-4444-4444-444444444444');
        sessionStorage.setItem('logged_user_id', 'f1111111-1111-1111-1111-111111111111');
        sessionStorage.setItem('logged_user_name', 'Administrador Master');
        sessionStorage.setItem('logged_user_email', email);
        sessionStorage.setItem('logged_user_tipo', 'Gestor');
        navigate('/gestor');
      } else {
        alert('Usuário não encontrado. Tente: gestor@universo.com / 123456');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePoloConfirm = () => {
    sessionStorage.setItem('active_polo_id', selectedPoloId);
    sessionStorage.setItem('logged_user_id', professorId);
    sessionStorage.setItem('logged_user_name', professorName);
    sessionStorage.setItem('logged_user_email', professorEmail);
    sessionStorage.setItem('logged_user_tipo', 'Professor');
    navigate('/professor');
  };

  // Formatadores de data e hora
  const formattedDate = currentTime.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  
  const formattedTime = currentTime.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return (
    <div className="min-h-screen w-full flex bg-slate-50 font-sans">
      
      {/* Lado Esquerdo - Identidade Visual (Degradê Azul Royal para Petróleo) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#001a33] items-center justify-center">
        {/* Imagem de Fundo base */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1920" 
            alt="Universidade" 
            className="w-full h-full object-cover opacity-60"
          />
          {/* Degradê ajustado para ser mais transparente e permitir ver a imagem */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#4169E1]/70 to-[#001a33]/90 mix-blend-multiply"></div>
        </div>

        {/* Card com Efeito Vidro (Glassmorphism) */}
        <div className="relative z-10 w-full max-w-xl p-8">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl rounded-[3rem] p-12 text-center relative overflow-hidden group hover:bg-white/15 transition-all duration-500 flex flex-col items-center">
            
            {/* Efeito de brilho decorativo no vidro */}
            <div className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-to-br from-white/10 via-transparent to-transparent rotate-45 pointer-events-none"></div>

            <div className="relative z-10 w-full">
              
              {/* Relógio e Data */}
              <div className="mb-10 flex flex-col items-center text-blue-100 border-b border-white/10 pb-6 w-full">
                <p className="uppercase tracking-[0.2em] text-[10px] font-bold mb-1 opacity-80">
                  {formattedDate}
                </p>
                <div className="text-4xl font-mono font-bold tracking-widest text-white flex items-center gap-3">
                  <Clock size={24} className="text-blue-400" />
                  {formattedTime}
                </div>
              </div>

              {/* Logo */}
              <div className="mb-8 transform transition-transform duration-500 cursor-default">
                <h1 className="text-6xl font-black tracking-tighter uppercase drop-shadow-lg mb-2 text-white">
                  Universo
                </h1>
                <div className="h-1.5 w-32 bg-gradient-to-r from-transparent via-white/50 to-transparent mx-auto rounded-full mb-4"></div>
                <h2 className="text-lg font-medium tracking-[0.35em] uppercase text-blue-50 drop-shadow-md">
                  Cursos e Consultoria
                </h2>
              </div>
              
              {/* Frase do Dia */}
              <div className="bg-white/5 rounded-2xl p-6 border border-white/5 mb-8">
                <div className="flex justify-center mb-4 text-blue-300 opacity-50">
                  <Quote size={24} />
                </div>
                <p className="text-white text-lg font-light leading-relaxed italic mb-4">
                  "{dailyQuote.text}"
                </p>
                <p className="text-xs uppercase tracking-widest font-bold text-blue-200">
                  — {dailyQuote.author}
                </p>
              </div>

              <div className="text-[10px] uppercase tracking-[0.2em] text-white/50 pt-4">
                © {new Date().getFullYear()} Portal Acadêmico
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lado Direito - Formulário de Login */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 relative">
        {/* Botão Voltar */}
        <button 
          onClick={() => navigate('/')}
          className="absolute top-8 left-8 flex items-center gap-2 text-slate-500 hover:text-[#4169E1] transition-colors text-sm font-bold uppercase tracking-widest group"
        >
          <div className="p-2 rounded-full bg-white border border-slate-200 shadow-sm group-hover:border-[#4169E1] transition-colors">
            <ArrowLeft size={16} />
          </div>
          <span className="hidden sm:inline">Voltar ao site</span>
        </button>

        {loginStep === 'credentials' ? (
          <div className="w-full max-w-md">
            <div className="mb-10 text-center lg:text-left">
              {/* Logo visível apenas no Mobile */}
              <div className="lg:hidden mb-8 inline-block">
                <span className="block text-3xl font-black text-[#001a33] uppercase tracking-tighter">Universo</span>
                <span className="block text-[10px] tracking-[0.25em] text-blue-600 uppercase font-bold">Cursos e Consultoria</span>
              </div>

              <h2 className="text-3xl font-black text-[#001a33] mb-3">Bem-vindo de volta!</h2>
              <p className="text-slate-500">Por favor, insira suas credenciais para acessar o portal.</p>
            </div>

            <LoginForm 
              onSubmit={handleLogin} 
              isLoading={isLoading} 
              onBack={() => navigate('/')} 
            />
          </div>
        ) : (
          <div className="w-full max-w-md animate-fadeIn">
            <div className="mb-8 text-center lg:text-left">
              <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4 mx-auto lg:mx-0">
                <Building2 size={24} />
              </div>
              <h2 className="text-2xl font-black text-[#001a33] mb-2 uppercase tracking-tight">Escolha a Unidade</h2>
              <p className="text-slate-500 text-sm">
                Olá, <strong className="text-purple-700">{professorName}</strong>! Selecione em qual polo deseja realizar seus lançamentos no momento:
              </p>
            </div>

            <div className="space-y-3 mb-8">
              {professorPolos.map((polo) => {
                const isSelected = selectedPoloId === polo.id;
                return (
                  <button
                    key={polo.id}
                    onClick={() => setSelectedPoloId(polo.id)}
                    className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all text-left group ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50/50 shadow-md ring-2 ring-purple-100'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl transition-colors ${isSelected ? 'bg-purple-100 text-purple-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                        <Building2 size={18} />
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${isSelected ? 'text-[#001a33]' : 'text-slate-700'}`}>
                          {polo.nome}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                          {polo.nome.toLowerCase().includes('matriz') ? 'Sede Central' : 'Filial'}
                        </p>
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckCircle2 className="text-purple-600" size={18} />
                    ) : (
                      <div className="w-5 h-5 rounded-full border border-slate-200" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3">
              <button
                onClick={handlePoloConfirm}
                className="w-full bg-gradient-to-r from-purple-600 to-[#001a33] hover:shadow-lg hover:shadow-purple-900/20 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 group transform active:scale-[0.98]"
              >
                <span>Confirmar e Acessar</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
              
              <button
                onClick={() => setLoginStep('credentials')}
                className="w-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 py-3.5 rounded-xl transition-all uppercase tracking-widest text-[10px] font-black text-center"
              >
                Voltar para Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;

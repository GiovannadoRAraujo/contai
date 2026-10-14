import { useState } from 'react';
import { ArrowLeft, Check, Eye, EyeOff, Loader2, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import Logo from '@/components/Logo';
import { Campo, Entrada } from '@/components/ui';
import { useApp } from '@/store/app';
import { CONTA_DEMO } from '@/data/demo';

type Modo = 'entrar' | 'cadastrar' | 'recuperar';

const DESTAQUES = [
  { Icone: Sparkles, titulo: 'Leitura de faturas com IA', texto: 'Envie a foto ou o PDF e revise cada lançamento antes de importar.' },
  { Icone: TrendingUp, titulo: 'Tudo em um só lugar', texto: 'Movimentações, orçamento, metas e carteira de investimentos.' },
  { Icone: ShieldCheck, titulo: 'Você no controle', texto: 'O assistente só lê os seus dados com a sua autorização expressa.' },
];

export default function Login() {
  const { estado, dispatch, avisar } = useApp();
  const [modo, setModo] = useState<Modo>('entrar');
  const [f, setF] = useState({ nome: '', email: CONTA_DEMO.email, senha: '', confirmar: '', aceite: false });
  const [verSenha, setVerSenha] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const validar = () => {
    const er: Record<string, string> = {};
    if (modo === 'cadastrar' && !f.nome.trim()) er.nome = 'Informe o seu nome.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) er.email = 'Informe um e-mail válido.';
    if (modo !== 'recuperar') {
      if (f.senha.length < 6) er.senha = 'A senha precisa ter ao menos 6 caracteres.';
      if (modo === 'cadastrar') {
        if (f.senha !== f.confirmar) er.confirmar = 'As senhas não coincidem.';
        if (!f.aceite) er.aceite = 'É necessário aceitar os termos e a política de privacidade.';
      }
    }
    setErros(er);
    return Object.keys(er).length === 0;
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validar()) return;
    setCarregando(true);
    await new Promise((r) => setTimeout(r, 650));
    setCarregando(false);

    if (modo === 'recuperar') {
      setEnviado(true);
      return;
    }

    if (modo === 'entrar') {
      const ok = f.email.trim().toLowerCase() === CONTA_DEMO.email && f.senha === CONTA_DEMO.senha;
      if (!ok) {
        setErros({ senha: 'E-mail ou senha incorretos. Use a conta de demonstração indicada abaixo.' });
        return;
      }
      dispatch({ t: 'autenticar', usuario: { email: f.email.trim() } });
      avisar(`Bem-vinda de volta, ${estado.usuario.nome.split(' ')[0]}.`);
      return;
    }

    dispatch({ t: 'autenticar', usuario: { nome: f.nome.trim(), email: f.email.trim(), consentimentoIA: f.aceite } });
    avisar('Conta criada nesta instalação de demonstração.');
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Painel da marca */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line/60 bg-nav p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(640px 420px at 18% 12%, rgba(124,58,237,.35), transparent 62%), radial-gradient(520px 380px at 82% 86%, rgba(39,217,208,.14), transparent 60%)',
          }}
        />
        <div className="relative">
          <Logo tamanho={40} />
          <h1 className="mt-14 max-w-md text-[34px] font-bold leading-[1.15] tracking-tight text-txt">
            Deixe sua vida financeira mais inteligente.
          </h1>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-txt2">
            O contAI organiza suas contas, lê suas faturas com inteligência artificial e mostra para onde o seu
            dinheiro está indo — com você no controle de cada classificação.
          </p>
        </div>

        <ul className="relative space-y-4">
          {DESTAQUES.map(({ Icone, titulo, texto }) => (
            <li key={titulo} className="flex gap-3.5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-roxo/30 bg-roxo/15 text-roxo-luz">
                <Icone size={18} />
              </span>
              <span>
                <span className="block text-[13.5px] font-semibold text-txt">{titulo}</span>
                <span className="block text-[12.5px] text-txt2">{texto}</span>
              </span>
            </li>
          ))}
        </ul>

        <p className="relative text-[11px] text-txt3">
          Ambiente de demonstração. Não utilize dados bancários reais.
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tamanho={36} />
          </div>

          {modo !== 'entrar' && (
            <button type="button" onClick={() => { setModo('entrar'); setEnviado(false); setErros({}); }}
              className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-txt2 hover:text-txt">
              <ArrowLeft size={14} /> Voltar para o login
            </button>
          )}

          <h2 className="text-[24px] font-bold tracking-tight text-txt">
            {modo === 'entrar' ? 'Entrar na sua conta' : modo === 'cadastrar' ? 'Criar conta' : 'Recuperar senha'}
          </h2>
          <p className="mt-1 text-[13px] text-txt2">
            {modo === 'entrar' && 'Acesse o painel financeiro do contAI.'}
            {modo === 'cadastrar' && 'Leva menos de um minuto para começar.'}
            {modo === 'recuperar' && 'Enviaremos as instruções para o seu e-mail.'}
          </p>

          {enviado ? (
            <div className="mt-6 rounded-2xl border border-verde/30 bg-verde/[0.07] p-5">
              <p className="flex items-center gap-2 text-[14px] font-semibold text-verde">
                <Check size={16} /> Solicitação registrada
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-txt2">
                Nesta instalação de demonstração não há serviço de e-mail configurado, portanto nenhuma mensagem foi
                enviada de fato. Em produção, um link de redefinição com validade curta seria enviado para{' '}
                <strong className="text-txt">{f.email}</strong>.
              </p>
            </div>
          ) : (
            <form onSubmit={enviar} className="mt-6 space-y-4" noValidate>
              {modo === 'cadastrar' && (
                <Campo rotulo="Nome completo" erro={erros.nome}>
                  <Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Como devemos te chamar" autoComplete="name" />
                </Campo>
              )}

              <Campo rotulo="E-mail" erro={erros.email}>
                <Entrada type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="voce@exemplo.com" autoComplete="email" />
              </Campo>

              {modo !== 'recuperar' && (
                <Campo rotulo="Senha" erro={erros.senha}>
                  <span className="relative block">
                    <Entrada
                      type={verSenha ? 'text' : 'password'}
                      value={f.senha}
                      onChange={(e) => setF({ ...f, senha: e.target.value })}
                      placeholder="••••••••"
                      autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-txt3 hover:text-txt">
                      {verSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </span>
                </Campo>
              )}

              {modo === 'cadastrar' && (
                <>
                  <Campo rotulo="Confirmar senha" erro={erros.confirmar}>
                    <Entrada type={verSenha ? 'text' : 'password'} value={f.confirmar}
                      onChange={(e) => setF({ ...f, confirmar: e.target.value })} placeholder="••••••••" autoComplete="new-password" />
                  </Campo>
                  <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-txt2">
                    <input type="checkbox" checked={f.aceite} onChange={(e) => setF({ ...f, aceite: e.target.checked })}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-card2 accent-[#7C3AED]" />
                    Aceito os termos de uso e autorizo o processamento dos meus dados financeiros pela IA do contAI,
                    conforme a política de privacidade (LGPD).
                  </label>
                  {erros.aceite && <p className="-mt-2 text-[11px] font-medium text-rosa">{erros.aceite}</p>}
                </>
              )}

              <button type="submit" className="btn-primary w-full" disabled={carregando}>
                {carregando ? <><Loader2 size={16} className="animate-spin" /> Processando…</>
                  : modo === 'entrar' ? 'Entrar'
                    : modo === 'cadastrar' ? 'Criar conta'
                      : 'Enviar instruções'}
              </button>
            </form>
          )}

          {modo === 'entrar' && (
            <>
              <div className="mt-4 flex items-center justify-between text-[12.5px]">
                <button type="button" onClick={() => { setModo('recuperar'); setErros({}); }} className="font-medium text-roxo-luz hover:text-txt">
                  Esqueci minha senha
                </button>
                <button type="button" onClick={() => { setModo('cadastrar'); setErros({}); setF({ ...f, email: '', senha: '' }); }} className="font-medium text-txt2 hover:text-txt">
                  Criar uma conta
                </button>
              </div>

              <div className="mt-6 rounded-xl border border-line bg-card2/60 p-4">
                <p className="text-[12px] font-semibold text-txt">Conta de demonstração</p>
                <p className="mt-1 text-[12px] text-txt2">
                  E-mail: <code className="text-roxo-luz">{CONTA_DEMO.email}</code><br />
                  Senha: <code className="text-roxo-luz">{CONTA_DEMO.senha}</code>
                </p>
                <button type="button" className="btn-ghost mt-3 w-full py-2 text-[12.5px]"
                  onClick={() => setF({ ...f, email: CONTA_DEMO.email, senha: CONTA_DEMO.senha })}>
                  Preencher automaticamente
                </button>
              </div>
            </>
          )}

          <p className="mt-6 text-[11px] leading-relaxed text-txt3">
            Autenticação local de demonstração: as credenciais são validadas no próprio navegador e a senha não é
            armazenada. Em produção, a autenticação deve ser feita por um provedor seguro (ex.: Supabase Auth), com
            senha sob hash no servidor e sessão por token.
          </p>
        </div>
      </main>
    </div>
  );
}

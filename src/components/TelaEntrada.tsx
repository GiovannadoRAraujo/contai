import { useEffect, useState } from 'react';
import { Bot, Cloud, Eye, EyeOff, FileUp, Loader2, Mail, ShieldCheck, Target } from 'lucide-react';
import clsx from 'clsx';
import { Marca } from './Logo';
import { Campo, Entrada } from './ui';
import { validarSenha } from './Conta';
import { useNuvem } from '@/store/nuvem';
import { useNav } from '@/store/nav';

type Modo = 'entrar' | 'criar' | 'recuperar';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DESTAQUES = [
  { Icone: FileUp, cor: '#8B5CF6', titulo: 'Faturas lidas por você', texto: 'Envie PDFs e fotos; revise antes de importar.' },
  { Icone: Bot, cor: '#27D9D0', titulo: 'Assistente com memória', texto: 'Respostas calculadas sobre os seus próprios registros.' },
  { Icone: Target, cor: '#2DE2A6', titulo: 'Metas e planejamento', texto: 'Orçamento, metas e contas recorrentes em um só lugar.' },
  { Icone: Cloud, cor: '#FF9F43', titulo: 'Celular e computador iguais', texto: 'Seus dados salvos na sua conta, em qualquer aparelho.' },
];

/** Tela de entrada: o contAI exige uma conta para guardar os dados de cada pessoa. */
export default function TelaEntrada() {
  const nuvem = useNuvem();
  const { ir } = useNav();
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [ver, setVer] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => { setErros({}); setSenha(''); setConfirmar(''); }, [modo]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) er.email = 'Informe um e-mail válido.';
    if (modo !== 'recuperar') {
      if (!senha) er.senha = 'Informe a senha.';
      else if (modo === 'criar') { const p = validarSenha(senha); if (p) er.senha = p; }
      if (!aceite) er.aceite = 'Para continuar, marque que concorda com os Termos de uso e a Política de privacidade.';
    }
    if (modo === 'criar' && confirmar !== senha) er.confirmar = 'As senhas não conferem.';
    setErros(er);
    if (Object.keys(er).length) return;

    setEnviando(true);
    try {
      if (modo === 'entrar') {
        await nuvem.entrar(email, senha);
      } else if (modo === 'criar') {
        const r = await nuvem.criarConta(email, senha);
        if (r === 'confirmar-email') setAviso(`Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail (confira também o spam), clique no link e você entra direto no contAI.`);
      } else {
        await nuvem.recuperarSenha(email);
        setAviso(`Se existir uma conta com ${email.trim()}, enviamos um link para criar uma nova senha. Ele pode ser aberto neste ou em outro aparelho.`);
      }
    } catch (err) {
      setErros({ geral: err instanceof Error ? err.message : 'Não foi possível concluir. Tente de novo.' });
    } finally {
      setEnviando(false);
    }
  };

  const linkTermos = (
    <button type="button" onClick={() => ir('privacidade')} className="font-semibold text-roxo-luz underline-offset-2 hover:underline">
      Termos de uso e a Política de privacidade
    </button>
  );

  return (
    <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Painel da marca (desktop) */}
      <aside className="relative hidden overflow-hidden border-r border-line/60 bg-nav lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-roxo/25 blur-[120px]" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-ciano/10 blur-[110px]" aria-hidden />
        <div className="relative flex items-center gap-3">
          <Marca tamanho={44} />
          <span className="text-[30px] font-bold tracking-tight text-txt">
            cont<span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#C084FC,#8B5CF6)' }}>AI</span>
          </span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-[34px] font-bold leading-tight tracking-tight text-txt">
            Deixe sua vida financeira mais <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#C084FC,#8B5CF6)' }}>inteligente</span>.
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-txt2">
            Organize receitas, despesas, faturas e investimentos com a ajuda de um assistente que entende os seus números.
          </p>
          <ul className="mt-8 space-y-4">
            {DESTAQUES.map(({ Icone, cor, titulo, texto }) => (
              <li key={titulo} className="flex gap-3.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${cor}22`, color: cor, boxShadow: `inset 0 0 0 1px ${cor}40` }}>
                  <Icone size={18} />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-txt">{titulo}</span>
                  <span className="block text-[12.5px] text-txt2">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11.5px] text-txt3">
          Não é consultoria financeira. Projeções são estimativas e não garantem rentabilidade.
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[420px] animate-fadeUp">
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <Marca tamanho={56} />
            <p className="mt-3 text-[28px] font-bold tracking-tight text-txt">
              cont<span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#C084FC,#8B5CF6)' }}>AI</span>
            </p>
            <p className="mt-1 text-[13px] text-txt2">Deixe sua vida financeira mais inteligente.</p>
          </div>

          <div className="rounded-2xl border border-line/70 bg-card p-6 shadow-card sm:p-7">
            {aviso ? (
              <div className="space-y-4 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-verde/15 text-verde"><Mail size={24} /></span>
                <h1 className="text-[19px] font-bold text-txt">Confira seu e-mail</h1>
                <p className="text-[13px] leading-relaxed text-txt2">{aviso}</p>
                <button type="button" className="btn-primary w-full" onClick={() => { setAviso(null); setModo('entrar'); }}>Voltar para “Entrar”</button>
              </div>
            ) : (
              <>
                {modo !== 'recuperar' ? (
                  <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-card2/60 p-1" role="tablist">
                    {(['entrar', 'criar'] as const).map((m) => (
                      <button key={m} type="button" role="tab" aria-selected={modo === m} onClick={() => setModo(m)}
                        className={clsx('rounded-lg py-2 text-[13px] font-semibold transition-colors',
                          modo === m ? 'bg-gradient-to-br from-roxo to-roxo-luz text-white shadow-glowsm' : 'text-txt2 hover:text-txt')}>
                        {m === 'entrar' ? 'Entrar' : 'Criar conta'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-5">
                    <h1 className="text-[19px] font-bold text-txt">Recuperar senha</h1>
                    <p className="mt-1 text-[12.5px] text-txt2">Enviaremos um link para você criar uma nova senha.</p>
                  </div>
                )}

                {modo !== 'recuperar' && (
                  <h1 className="mb-4 text-[19px] font-bold text-txt">{modo === 'entrar' ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
                )}

                <form onSubmit={enviar} noValidate className="space-y-3.5">
                  <Campo rotulo="E-mail" erro={erros.email}>
                    <Entrada type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoFocus />
                  </Campo>

                  {modo !== 'recuperar' && (
                    <Campo rotulo="Senha" erro={erros.senha} dica={modo === 'criar' ? 'Mínimo de 8 caracteres, com letras e números.' : undefined}>
                      <div className="relative">
                        <Entrada type={ver ? 'text' : 'password'} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                          value={senha} onChange={(e) => setSenha(e.target.value)} className="pr-10" />
                        <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-txt3 hover:text-txt">
                          {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </Campo>
                  )}

                  {modo === 'criar' && (
                    <Campo rotulo="Confirmar senha" erro={erros.confirmar}>
                      <Entrada type={ver ? 'text' : 'password'} autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
                    </Campo>
                  )}

                  {modo === 'entrar' && (
                    <div className="-mt-1 text-right">
                      <button type="button" className="text-[12px] font-medium text-txt2 hover:text-roxo-luz" onClick={() => setModo('recuperar')}>Esqueci a senha</button>
                    </div>
                  )}

                  {modo !== 'recuperar' && (
                    <div>
                      <label className={clsx('flex items-start gap-2.5 rounded-xl border p-3 text-[12.5px] leading-relaxed text-txt2',
                        erros.aceite ? 'border-rosa/50 bg-rosa/[0.05]' : 'border-line bg-card2/50')}>
                        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[#7C3AED]" aria-describedby="termos-detalhe" />
                        <span>Li e concordo com os {linkTermos}.</span>
                      </label>
                      {erros.aceite && <p className="mt-1 text-[11px] font-medium text-rosa">{erros.aceite}</p>}
                    </div>
                  )}

                  {erros.geral && <p role="alert" className="rounded-lg border border-rosa/40 bg-rosa/10 px-3 py-2 text-[12.5px] text-rosa">{erros.geral}</p>}

                  <button type="submit" className="btn-primary w-full py-3" disabled={enviando}>
                    {enviando && <Loader2 size={15} className="animate-spin" />}
                    {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
                  </button>

                  {modo === 'recuperar' && (
                    <button type="button" className="w-full text-[12.5px] font-semibold text-roxo-luz hover:text-txt" onClick={() => setModo('entrar')}>Voltar para “Entrar”</button>
                  )}
                </form>
              </>
            )}
          </div>

          <p id="termos-detalhe" className="mt-5 text-center text-[11.5px] leading-relaxed text-txt3">
            <ShieldCheck size={13} className="-mt-0.5 mr-1 inline-block text-verde" />
            <span>
              Seus dados ficam na sua conta, acessíveis só a você.{' '}
              <button type="button" onClick={() => ir('privacidade')} className="font-medium text-txt2 underline-offset-2 hover:text-roxo-luz hover:underline">Ver termos e privacidade</button>
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}

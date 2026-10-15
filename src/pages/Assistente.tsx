import { useEffect, useRef, useState } from 'react';
import { Brain, Info, Loader2, Plus, Send, ShieldCheck, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { Marca } from '@/components/Logo';
import { Card, Confirmacao } from '@/components/ui';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { perguntar, SUGESTOES_INICIAIS } from '@/lib/assistente';
import { IA_CONFIGURADA } from '@/lib/documentos';
import { dataBR, uid } from '@/lib/format';
import type { Mensagem } from '@/types';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function Assistente() {
  const { estado, dispatch, avisar } = useApp();
  const { periodo, abrir, ir } = useNav();
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [limpar, setLimpar] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [estado.conversas.length, pensando]);

  const enviar = async (pergunta: string) => {
    const limpa = pergunta.trim().slice(0, 2000);
    if (!limpa || pensando) return;
    if (limpa === 'Abrir o simulador completo') { abrir('simulador'); return; }

    const msgUser: Mensagem = { id: uid(), autor: 'user', texto: limpa, em: new Date().toISOString() };
    dispatch({ t: 'chat.add', msg: msgUser });
    setTexto('');
    setPensando(true);
    try {
      // O estado enviado já inclui a pergunta, para o contexto da conversa
      const r = await perguntar(limpa, { ...estado, conversas: [...estado.conversas, msgUser] }, periodo);
      if (r.memoria) dispatch({ t: 'memoria', dados: r.memoria });
      r.efeitos?.forEach((ef) => {
        if (ef.t === 'regra') dispatch({ t: 'regra.add', padrao: ef.padrao, categoria: ef.categoria, origem: 'assistente' });
        if (ef.t === 'categoria') dispatch({ t: 'categoria.add', nome: ef.nome, tipo: ef.tipo });
      });
      dispatch({
        t: 'chat.add',
        msg: { id: uid(), autor: 'ia', texto: r.texto, detalhe: r.detalhe, sugestoes: r.sugestoes, em: new Date().toISOString() },
      });
    } catch {
      dispatch({
        t: 'chat.add',
        msg: { id: uid(), autor: 'ia', texto: 'Não consegui processar sua pergunta agora. Tente novamente em instantes.', em: new Date().toISOString() },
      });
    } finally {
      setPensando(false);
      campo.current?.focus();
    }
  };

  const vazio = estado.conversas.length === 0;
  const qtdMemoria = estado.memoria.preferencias.length + estado.regras.length;
  const primeiraData = estado.conversas[0]?.em;

  return (
    <div className="flex h-[calc(100dvh-230px)] min-h-[480px] flex-col gap-3 pb-2 lg:h-[calc(100dvh-140px)]">
      {/* Situação do assistente */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto text-[11.5px]">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-txt2">
          <ShieldCheck size={13} className={estado.prefs.consentimentoIA ? 'text-verde' : 'text-laranja'} />
          {estado.prefs.consentimentoIA ? 'Consulta seus registros locais' : 'Sem permissão para ler seus registros'}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-txt2">
          <Sparkles size={13} className={IA_CONFIGURADA && estado.prefs.consentimentoEnvioExterno ? 'text-roxo-luz' : 'text-laranja'} />
          {IA_CONFIGURADA
            ? estado.prefs.consentimentoEnvioExterno ? 'Serviço de IA externo autorizado' : 'Serviço de IA disponível, não autorizado'
            : 'Motor local de cálculo — sem modelo de IA externo'}
        </span>
        <button type="button" onClick={() => ir('configuracoes')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-txt2 hover:border-roxo/50 hover:text-txt">
          <Brain size={13} className="text-roxo-luz" /> Memória: {estado.memoria.preferencias.length} preferência(s), {estado.regras.length} regra(s)
        </button>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line/60 px-4 py-3 sm:px-5">
          <Marca tamanho={34} fundo />
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-txt">Assistente contAI</p>
            <p className="truncate text-[11.5px] text-txt3">
              {primeiraData ? `Conversa salva neste navegador desde ${dataBR(primeiraData)}` : 'Respostas calculadas a partir dos seus registros'}
            </p>
          </div>
          <button type="button" onClick={() => (vazio ? undefined : setLimpar(true))} disabled={vazio}
            aria-label="Nova conversa (apaga o histórico)" title="Nova conversa"
            className="grid h-9 w-9 place-items-center rounded-xl border border-line text-txt2 transition-colors hover:border-roxo/50 hover:text-txt disabled:opacity-40">
            <Plus size={17} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-5 sm:px-5" aria-live="polite">
          {vazio && (
            <div className="mx-auto max-w-xl py-4 text-center">
              <span className="mx-auto inline-block"><Marca tamanho={52} fundo /></span>
              <h3 className="mt-4 text-[16px] font-semibold text-txt">Como posso ajudar com suas finanças?</h3>
              <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-txt2">
                Pergunte sobre gastos, contas a vencer, metas ou simulações. Eu calculo com os dados registrados no contAI e
                mostro de onde vem cada número. Também lembro do que você me pedir{qtdMemoria ? ` — já tenho ${qtdMemoria} item(ns) na memória` : ''}.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGESTOES_INICIAIS.map((s) => (
                  <button key={s} type="button" onClick={() => void enviar(s)}
                    className="rounded-xl border border-line bg-card2/60 px-3.5 py-2.5 text-left text-[12.5px] text-txt2 transition-all hover:border-roxo/50 hover:text-txt">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {estado.conversas.map((m) => (
            <div key={m.id} className={clsx('flex gap-2.5', m.autor === 'user' ? 'justify-end' : 'justify-start')}>
              {m.autor === 'ia' && <span className="mt-0.5"><Marca tamanho={30} fundo /></span>}
              <div className="max-w-[min(580px,86%)] space-y-1.5">
                <div
                  className={clsx(
                    'animate-fadeUp rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed',
                    m.autor === 'user' ? 'rounded-br-md text-white shadow-glowsm' : 'rounded-tl-md border border-line bg-card2 text-txt',
                  )}
                  style={m.autor === 'user' ? { backgroundImage: 'linear-gradient(135deg,#7C3AED,#9B6BF8)' } : undefined}
                >
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                  <p className={clsx('mt-1 text-right text-[10px]', m.autor === 'user' ? 'text-white/70' : 'text-txt3')}>{hora(m.em)}</p>
                </div>

                {m.detalhe && (
                  <div>
                    <button type="button" onClick={() => setAbertos((a) => ({ ...a, [m.id]: !a[m.id] }))}
                      className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-[11.5px] font-medium text-roxo-luz hover:text-txt">
                      <Info size={12} /> {abertos[m.id] ? 'Ocultar origem dos números' : 'De onde vêm esses números?'}
                    </button>
                    {abertos[m.id] && (
                      <p className="mt-1 animate-fadeUp rounded-xl border border-line bg-card px-3 py-2.5 text-[11.5px] leading-relaxed text-txt2">{m.detalhe}</p>
                    )}
                  </div>
                )}

                {m.sugestoes && m.sugestoes.length > 0 && m.id === estado.conversas.at(-1)?.id && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.sugestoes.map((s) => (
                      <button key={s} type="button" onClick={() => void enviar(s)} className="chip">{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {pensando && (
            <div className="flex items-center gap-2.5">
              <Marca tamanho={30} fundo />
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border border-line bg-card2 px-4 py-3 text-[13px] text-txt2">
                <Loader2 size={14} className="animate-spin text-roxo-luz" /> Consultando seus registros…
              </div>
            </div>
          )}
          <div ref={fim} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void enviar(texto); }} className="border-t border-line/60 p-3 sm:p-4">
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-card2 p-1.5 pl-3 focus-within:border-roxo">
            <label className="sr-only" htmlFor="mensagem">Mensagem</label>
            <textarea
              ref={campo}
              id="mensagem"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }}
              rows={1}
              maxLength={2000}
              placeholder="Digite sua mensagem…"
              className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[13.5px] text-txt placeholder:text-txt3 focus:outline-none"
            />
            <button type="submit" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-glowsm transition-transform active:scale-95 disabled:opacity-40"
              style={{ backgroundImage: 'linear-gradient(135deg,#7C3AED,#A855F7)' }}
              disabled={!texto.trim() || pensando} aria-label="Enviar">
              <Send size={16} />
            </button>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-txt3">
            Respostas calculadas sobre os seus registros locais. Não é recomendação de investimento — confira os números antes de decidir.
          </p>
        </form>
      </Card>

      <Confirmacao
        aberto={limpar}
        titulo="Começar nova conversa?"
        mensagem="O histórico desta conversa será apagado deste navegador. Preferências e regras aprendidas continuam na memória (apague em Configurações, se quiser)."
        rotuloConfirmar="Apagar histórico"
        onCancelar={() => setLimpar(false)}
        onConfirmar={() => { dispatch({ t: 'chat.limpar' }); avisar('Histórico da conversa apagado.', 'info'); setLimpar(false); }}
      />
    </div>
  );
}

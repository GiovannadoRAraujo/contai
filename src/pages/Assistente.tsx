import { useEffect, useRef, useState } from 'react';
import { Info, Loader2, Send, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Marca } from '@/components/Logo';
import { Card } from '@/components/ui';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';
import { perguntar, SUGESTOES_INICIAIS } from '@/lib/assistente';
import { IA_CONFIGURADA } from '@/lib/documentos';
import { iniciais, uid } from '@/lib/format';
import type { Mensagem } from '@/types';

export default function Assistente() {
  const { estado, dispatch, avisar } = useApp();
  const { periodo, abrir } = useNav();
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [estado.conversas.length, pensando]);

  const enviar = async (pergunta: string) => {
    const limpa = pergunta.trim();
    if (!limpa || pensando) return;

    if (limpa === 'Abrir o simulador completo') {
      abrir('simulador');
      return;
    }

    const msgUser: Mensagem = { id: uid(), autor: 'user', texto: limpa, em: new Date().toISOString() };
    dispatch({ t: 'chat.add', msg: msgUser });
    setTexto('');
    setPensando(true);
    try {
      const r = await perguntar(limpa, estado, periodo);
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
    }
  };

  const vazio = estado.conversas.length === 0;

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[520px] flex-col gap-4 pb-4 lg:h-[calc(100vh-150px)]">
      {/* Aviso de consentimento / modo */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-txt2">
          <ShieldCheck size={13} className={estado.usuario.consentimentoIA ? 'text-verde' : 'text-laranja'} />
          {estado.usuario.consentimentoIA
            ? 'Autorizado a usar seus dados financeiros deste aplicativo'
            : 'Sem autorização para ler seus dados — ative em Configurações'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-txt2">
          <Sparkles size={13} className={IA_CONFIGURADA ? 'text-roxo-luz' : 'text-laranja'} />
          {IA_CONFIGURADA ? 'Conectado ao serviço de IA' : 'Motor local de demonstração (sem serviço de IA externo)'}
        </span>
        {!vazio && (
          <button type="button" onClick={() => { dispatch({ t: 'chat.limpar' }); avisar('Conversa apagada.', 'info'); }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-card2 px-3 py-1.5 text-txt2 hover:border-rosa/50 hover:text-rosa">
            <Trash2 size={13} /> Limpar conversa
          </button>
        )}
      </div>

      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line/60 px-5 py-3.5">
          <Marca tamanho={34} />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-txt">Assistente contAI</p>
            <p className="text-[11.5px] text-txt3">Responde com base nas suas movimentações, faturas, metas e investimentos.</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
          {vazio && (
            <div className="mx-auto max-w-lg py-6 text-center">
              <Marca tamanho={48} />
              <h3 className="mt-4 text-[16px] font-semibold text-txt">Como posso ajudar com suas finanças?</h3>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-txt2">
                Pergunte sobre gastos, contas a vencer, metas ou simulações. Eu uso apenas os dados registrados
                no contAI e explico de onde vem cada número.
              </p>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {SUGESTOES_INICIAIS.map((s) => (
                  <button key={s} type="button" onClick={() => enviar(s)}
                    className="rounded-xl border border-line bg-card2/60 px-3.5 py-2.5 text-left text-[12.5px] text-txt2 transition-all hover:border-roxo/50 hover:text-txt">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {estado.conversas.map((m) => (
            <div key={m.id} className={clsx('flex gap-2.5', m.autor === 'user' ? 'justify-end' : 'justify-start')}>
              {m.autor === 'ia' && <Marca tamanho={30} />}
              <div className={clsx('max-w-[min(560px,85%)] space-y-2')}>
                <div
                  className={clsx(
                    'animate-fadeUp rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed',
                    m.autor === 'user'
                      ? 'rounded-br-md text-white'
                      : 'rounded-bl-md border border-line bg-card2 text-txt',
                  )}
                  style={m.autor === 'user' ? { backgroundImage: 'linear-gradient(135deg,#7C3AED,#8B5CF6)' } : undefined}
                >
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                </div>

                {m.detalhe && (
                  <div>
                    <button type="button" onClick={() => setAbertos((a) => ({ ...a, [m.id]: !a[m.id] }))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card2/70 px-2.5 py-1.5 text-[11.5px] font-medium text-roxo-luz hover:text-txt">
                      <Info size={12} /> {abertos[m.id] ? 'Ocultar origem dos números' : 'Ver de onde vêm os números'}
                    </button>
                    {abertos[m.id] && (
                      <p className="mt-1.5 animate-fadeUp rounded-xl border border-line bg-card px-3 py-2.5 text-[11.5px] leading-relaxed text-txt2">
                        {m.detalhe}
                      </p>
                    )}
                  </div>
                )}

                {m.sugestoes && m.sugestoes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.sugestoes.map((s) => (
                      <button key={s} type="button" onClick={() => enviar(s)} className="chip">{s}</button>
                    ))}
                  </div>
                )}
              </div>
              {m.autor === 'user' && (
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] text-[11px] font-bold text-white"
                  style={{ backgroundImage: 'linear-gradient(135deg,#27D9D0,#2DE2A6)' }}>
                  {iniciais(estado.usuario.nome)}
                </span>
              )}
            </div>
          ))}

          {pensando && (
            <div className="flex items-center gap-2.5">
              <Marca tamanho={30} />
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-card2 px-4 py-3 text-[13px] text-txt2">
                <Loader2 size={14} className="animate-spin text-roxo-luz" />
                Consultando seus dados…
              </div>
            </div>
          )}
          <div ref={fim} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); enviar(texto); }}
          className="border-t border-line/60 p-3 sm:p-4"
        >
          <div className="flex items-end gap-2">
            <label className="sr-only" htmlFor="mensagem">Mensagem</label>
            <textarea
              id="mensagem"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(texto); }
              }}
              rows={1}
              placeholder="Digite sua mensagem…"
              className="field max-h-32 min-h-[44px] flex-1 resize-none py-3"
            />
            <button type="submit" className="btn-primary h-[44px] w-[44px] !px-0" disabled={!texto.trim() || pensando} aria-label="Enviar">
              <Send size={16} />
            </button>
          </div>
          <p className="mt-2 text-[10.5px] leading-snug text-txt3">
            O assistente usa apenas os dados deste aplicativo e não oferece recomendação de investimento.
            Confira os números antes de tomar decisões.
          </p>
        </form>
      </Card>
    </div>
  );
}

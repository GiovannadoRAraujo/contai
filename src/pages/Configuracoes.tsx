import { useState } from 'react';
import { Database, Eye, KeyRound, Plus, ShieldCheck, Trash2, User, Wallet } from 'lucide-react';
import { Badge, CabecalhoCard, Campo, Card, Confirmacao, Entrada, Selecao } from '@/components/ui';
import { useApp } from '@/store/app';
import { brl, parseBRL, uid } from '@/lib/format';
import { IA_CONFIGURADA } from '@/lib/documentos';
import type { Conta } from '@/types';

export default function Configuracoes() {
  const { estado, dispatch, avisar } = useApp();
  const [nome, setNome] = useState(estado.usuario.nome);
  const [email, setEmail] = useState(estado.usuario.email);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [resetar, setResetar] = useState(false);
  const [apagar, setApagar] = useState(false);
  const [novaConta, setNovaConta] = useState({ nome: '', tipo: 'corrente' as Conta['tipo'], saldo: '', limite: '' });

  return (
    <div className="space-y-5 pb-8">
      {/* Conta */}
      <Card className="p-5">
        <CabecalhoCard titulo="Dados da conta" icone={<User size={16} className="text-roxo-luz" />} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim()) return;
            dispatch({ t: 'usuario', dados: { nome: nome.trim(), email: email.trim() } });
            avisar('Dados da conta atualizados.');
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Campo rotulo="Nome">
            <Entrada value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Campo rotulo="E-mail">
            <Entrada type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Campo>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">Salvar alterações</button>
          </div>
        </form>
      </Card>

      {/* Privacidade */}
      <Card className="p-5">
        <CabecalhoCard titulo="Privacidade e uso de IA" icone={<ShieldCheck size={16} className="text-roxo-luz" />} />
        <div className="space-y-3">
          <Opcao
            titulo="Autorizar o uso dos meus dados pela IA"
            descricao="Permite que o Assistente contAI leia suas movimentações, faturas, metas e investimentos para responder às suas perguntas. Você pode revogar a qualquer momento."
            ligado={estado.usuario.consentimentoIA}
            onMudar={(v) => {
              dispatch({ t: 'usuario', dados: { consentimentoIA: v } });
              avisar(v ? 'Consentimento concedido.' : 'Consentimento revogado. O assistente deixará de ler seus dados.', 'info');
            }}
          />
          <Opcao
            titulo="Ocultar valores na tela"
            descricao="Substitui os valores monetários por marcadores em todas as telas. Útil em locais públicos."
            ligado={estado.usuario.ocultarValores}
            onMudar={(v) => dispatch({ t: 'usuario', dados: { ocultarValores: v } })}
            icone={<Eye size={15} />}
          />
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-line bg-card2/50 p-4 text-[12px] leading-relaxed text-txt2">
          <p className="flex items-center gap-2 font-semibold text-txt">
            <KeyRound size={14} className="text-roxo-luz" /> Como seus dados são tratados nesta instalação
          </p>
          <ul className="list-inside list-disc space-y-1">
            <li>Os dados ficam armazenados localmente no navegador deste dispositivo (<code className="text-roxo-luz">localStorage</code>).</li>
            <li>Nenhuma chave de API é lida ou armazenada no frontend. A integração de IA, quando configurada, passa por um backend próprio.</li>
            <li>
              Serviço de IA: <strong className={IA_CONFIGURADA ? 'text-verde' : 'text-laranja'}>
                {IA_CONFIGURADA ? 'conectado' : 'não configurado (modo demonstração)'}
              </strong>.
            </li>
            <li>Arquivos enviados são validados por formato e tamanho e, em modo demonstração, não saem do seu dispositivo.</li>
            <li>Você pode excluir documentos, movimentações e toda a conta nas opções abaixo (LGPD, art. 18).</li>
          </ul>
        </div>
      </Card>

      {/* Contas */}
      <Card className="p-5">
        <CabecalhoCard titulo="Contas e cartões" icone={<Wallet size={16} className="text-roxo-luz" />} />
        <ul className="mb-4 space-y-2">
          {estado.contas.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-card2/50 p-3">
              <span className="h-9 w-1.5 rounded-full" style={{ background: c.cor }} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-txt">{c.nome}</span>
                <span className="block text-[11.5px] text-txt3">
                  {c.tipo === 'cartao' ? `Cartão de crédito · limite ${brl(c.limite ?? 0)}` : `${c.tipo} · saldo inicial ${brl(c.saldoInicial)}`}
                </span>
              </span>
              <Badge tom={c.tipo === 'cartao' ? 'roxo' : 'neutro'}>{c.tipo}</Badge>
            </li>
          ))}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!novaConta.nome.trim()) return;
            dispatch({
              t: 'conta.add',
              conta: {
                id: uid(),
                nome: novaConta.nome.trim(),
                tipo: novaConta.tipo,
                saldoInicial: novaConta.tipo === 'cartao' ? 0 : parseBRL(novaConta.saldo),
                limite: novaConta.tipo === 'cartao' ? parseBRL(novaConta.limite) : undefined,
                cor: '#8B5CF6',
              },
            });
            avisar('Conta adicionada.');
            setNovaConta({ nome: '', tipo: 'corrente', saldo: '', limite: '' });
          }}
          className="grid gap-3 sm:grid-cols-4"
        >
          <Campo rotulo="Nome">
            <Entrada value={novaConta.nome} onChange={(e) => setNovaConta({ ...novaConta, nome: e.target.value })} placeholder="Ex.: C6 Bank" />
          </Campo>
          <Campo rotulo="Tipo">
            <Selecao value={novaConta.tipo} onChange={(e) => setNovaConta({ ...novaConta, tipo: e.target.value as Conta['tipo'] })}>
              <option value="corrente">Conta corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="carteira">Carteira</option>
              <option value="cartao">Cartão de crédito</option>
            </Selecao>
          </Campo>
          {novaConta.tipo === 'cartao' ? (
            <Campo rotulo="Limite (R$)">
              <Entrada value={novaConta.limite} onChange={(e) => setNovaConta({ ...novaConta, limite: e.target.value })} inputMode="decimal" placeholder="3.000,00" />
            </Campo>
          ) : (
            <Campo rotulo="Saldo inicial (R$)">
              <Entrada value={novaConta.saldo} onChange={(e) => setNovaConta({ ...novaConta, saldo: e.target.value })} inputMode="decimal" placeholder="0,00" />
            </Campo>
          )}
          <div className="flex items-end">
            <button type="submit" className="btn-ghost w-full"><Plus size={15} /> Adicionar</button>
          </div>
        </form>
      </Card>

      {/* Categorias e regras */}
      <Card className="p-5">
        <CabecalhoCard titulo="Categorias e regras de classificação" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = novaCategoria.trim();
            if (!n) return;
            dispatch({ t: 'categoria.add', nome: n });
            avisar(`Categoria "${n}" criada.`);
            setNovaCategoria('');
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <Campo rotulo="Nova categoria" className="flex-1 min-w-[220px]">
            <Entrada value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} placeholder="Ex.: Pets" />
          </Campo>
          <button type="submit" className="btn-ghost"><Plus size={15} /> Criar categoria</button>
        </form>

        {estado.categoriasCustom.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {estado.categoriasCustom.map((c) => <Badge key={c} tom="roxo">{c}</Badge>)}
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-[12.5px] font-medium text-txt2">
            Regras aprendidas com as suas correções ({Object.keys(estado.regrasCategoria).length})
          </p>
          {Object.keys(estado.regrasCategoria).length === 0 ? (
            <p className="text-[12.5px] text-txt3">
              Nenhuma regra ainda. Ao corrigir a classificação de uma transação na revisão de faturas, você pode salvar
              a escolha como referência para lançamentos semelhantes.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(estado.regrasCategoria).map(([padrao, categoria]) => (
                <li key={padrao} className="flex items-center gap-2 rounded-lg border border-line bg-card2/60 px-3 py-1.5 text-[12px]">
                  <code className="text-roxo-luz">{padrao}</code>
                  <span className="text-txt3">→</span>
                  <span className="text-txt">{categoria}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Dados */}
      <Card className="p-5">
        <CabecalhoCard titulo="Meus dados" icone={<Database size={16} className="text-roxo-luz" />} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'contai-meus-dados.json';
              a.click();
              URL.revokeObjectURL(url);
              avisar('Arquivo com os seus dados foi gerado.');
            }}
          >
            Exportar meus dados (JSON)
          </button>
          <button type="button" className="btn-ghost" onClick={() => setResetar(true)}>
            Restaurar base de demonstração
          </button>
          <button type="button" className="btn border border-rosa/40 bg-rosa/10 text-rosa hover:bg-rosa/20" onClick={() => setApagar(true)}>
            <Trash2 size={15} /> Excluir todos os meus dados
          </button>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-txt3">
          A exclusão remove movimentações, faturas, documentos, metas, investimentos e preferências deste navegador.
          A ação não pode ser desfeita.
        </p>
      </Card>

      <Confirmacao
        aberto={resetar}
        titulo="Restaurar base de demonstração"
        mensagem="Todos os dados atuais serão substituídos pela base de demonstração do contAI. Esta ação não pode ser desfeita."
        rotuloConfirmar="Restaurar"
        perigoso={false}
        onCancelar={() => setResetar(false)}
        onConfirmar={() => { dispatch({ t: 'reset' }); avisar('Base de demonstração restaurada.'); setResetar(false); }}
      />

      <Confirmacao
        aberto={apagar}
        titulo="Excluir todos os meus dados"
        mensagem="Movimentações, faturas, metas, investimentos, regras e preferências serão apagados deste navegador. Esta ação não pode ser desfeita."
        rotuloConfirmar="Excluir tudo"
        onCancelar={() => setApagar(false)}
        onConfirmar={() => {
          localStorage.removeItem('contai.estado.v1');
          avisar('Dados excluídos. Recarregando…', 'info');
          setTimeout(() => window.location.reload(), 800);
        }}
      />
    </div>
  );
}

function Opcao({
  titulo, descricao, ligado, onMudar, icone,
}: { titulo: string; descricao: string; ligado: boolean; onMudar: (v: boolean) => void; icone?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-card2/50 p-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13.5px] font-medium text-txt">{icone}{titulo}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-txt2">{descricao}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label={titulo}
        onClick={() => onMudar(!ligado)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? 'bg-roxo' : 'bg-card2 border border-line'}`}
      >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${ligado ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}


import { useEffect, useState } from 'react';
import { Campo, Entrada, Modal, Selecao } from './ui';
import { useApp } from '@/store/app';
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA } from '@/lib/categorias';
import { hoje, parseBRL, uid } from '@/lib/format';
import type { Investimento, Meta, Modalidade, Movimentacao, TipoMov } from '@/types';

const MODALIDADES: Modalidade[] = ['Renda fixa', 'Tesouro Direto', 'CDB', 'LCI/LCA', 'Fundos', 'Ações', 'ETFs', 'Outros'];

/* ----------------------- Receita / Despesa ----------------------- */
export function ModalMovimentacao({
  aberto, onFechar, tipo, editando,
}: { aberto: boolean; onFechar: () => void; tipo: TipoMov; editando?: Movimentacao | null }) {
  const { estado, dispatch, avisar } = useApp();
  const categorias = [
    ...(tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA),
    ...estado.categoriasCustom,
  ];

  const vazio = {
    descricao: '', valor: '', data: hoje(),
    categoria: categorias[0] as string,
    contaId: estado.contas[0]?.id ?? '',
    observacao: '',
  };
  const [f, setF] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(editando
      ? {
        descricao: editando.descricao,
        valor: editando.valor.toFixed(2).replace('.', ','),
        data: editando.data,
        categoria: editando.categoria,
        contaId: editando.contaId,
        observacao: editando.observacao ?? '',
      }
      : vazio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, editando]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const novosErros: Record<string, string> = {};
    if (!f.descricao.trim()) novosErros.descricao = 'Informe uma descrição.';
    const valor = parseBRL(f.valor);
    if (!valor || valor <= 0) novosErros.valor = 'Informe um valor maior que zero.';
    if (!f.data) novosErros.data = 'Informe a data.';
    if (!f.contaId) novosErros.contaId = 'Selecione uma conta.';
    setErros(novosErros);
    if (Object.keys(novosErros).length) return;

    const mov: Movimentacao = {
      id: editando?.id ?? uid(),
      tipo,
      descricao: f.descricao.trim(),
      valor,
      data: f.data,
      categoria: f.categoria,
      contaId: f.contaId,
      origem: editando?.origem ?? 'manual',
      observacao: f.observacao.trim() || undefined,
      faturaId: editando?.faturaId,
      parcela: editando?.parcela,
    };

    dispatch(editando ? { t: 'mov.upd', mov } : { t: 'mov.add', movs: [mov] });
    avisar(editando ? 'Movimentação atualizada.' : `${tipo === 'receita' ? 'Receita' : 'Despesa'} registrada.`);
    onFechar();
  };

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo={editando ? 'Editar movimentação' : tipo === 'receita' ? 'Adicionar receita' : 'Adicionar despesa'}
      descricao={editando ? undefined : 'O lançamento entra imediatamente nos indicadores e gráficos.'}
    >
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Campo rotulo="Descrição" erro={erros.descricao}>
          <Entrada value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Ex.: Supermercado do mês" autoFocus />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" erro={erros.valor}>
            <Entrada value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} inputMode="decimal" placeholder="0,00" />
          </Campo>
          <Campo rotulo="Data" erro={erros.data}>
            <Entrada type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Categoria">
            <Selecao value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
              {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Conta" erro={erros.contaId}>
            <Selecao value={f.contaId} onChange={(e) => setF({ ...f, contaId: e.target.value })}>
              {estado.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Selecao>
          </Campo>
        </div>

        <Campo rotulo="Observação (opcional)">
          <Entrada value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} placeholder="Anotação interna" />
        </Campo>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary">{editando ? 'Salvar alterações' : 'Adicionar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------- Meta ----------------------------- */
export function ModalMeta({
  aberto, onFechar, editando,
}: { aberto: boolean; onFechar: () => void; editando?: Meta | null }) {
  const { dispatch, avisar } = useApp();
  const vazio = { nome: '', alvo: '', atual: '', prazo: '', cor: '#A855F7' };
  const [f, setF] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(editando
      ? { nome: editando.nome, alvo: String(editando.alvo).replace('.', ','), atual: String(editando.atual).replace('.', ','), prazo: editando.prazo, cor: editando.cor }
      : vazio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, editando]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.nome.trim()) er.nome = 'Informe o nome da meta.';
    const alvo = parseBRL(f.alvo);
    if (!alvo || alvo <= 0) er.alvo = 'Informe o valor alvo.';
    if (!f.prazo) er.prazo = 'Informe o prazo.';
    const atual = parseBRL(f.atual);
    if (atual > alvo) er.atual = 'O valor guardado não pode ser maior que o alvo.';
    setErros(er);
    if (Object.keys(er).length) return;

    const meta: Meta = { id: editando?.id ?? uid(), nome: f.nome.trim(), alvo, atual, prazo: f.prazo, cor: f.cor };
    dispatch(editando ? { t: 'meta.upd', meta } : { t: 'meta.add', meta });
    avisar(editando ? 'Meta atualizada.' : 'Meta criada.');
    onFechar();
  };

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={editando ? 'Editar meta' : 'Criar meta'} descricao="Defina um objetivo e acompanhe o progresso.">
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Campo rotulo="Nome da meta" erro={erros.nome}>
          <Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Viagem de férias" autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor alvo (R$)" erro={erros.alvo}>
            <Entrada value={f.alvo} onChange={(e) => setF({ ...f, alvo: e.target.value })} inputMode="decimal" placeholder="6.000,00" />
          </Campo>
          <Campo rotulo="Já guardado (R$)" erro={erros.atual}>
            <Entrada value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} inputMode="decimal" placeholder="0,00" />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Prazo" erro={erros.prazo}>
            <Entrada type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
          </Campo>
          <Campo rotulo="Cor">
            <Selecao value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })}>
              <option value="#A855F7">Roxo</option>
              <option value="#27D9D0">Ciano</option>
              <option value="#2DE2A6">Verde</option>
              <option value="#FF9F43">Laranja</option>
              <option value="#F052A0">Rosa</option>
            </Selecao>
          </Campo>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary">{editando ? 'Salvar' : 'Criar meta'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------- Investimento -------------------------- */
export function ModalInvestimento({
  aberto, onFechar, editando,
}: { aberto: boolean; onFechar: () => void; editando?: Investimento | null }) {
  const { dispatch, avisar } = useApp();
  const vazio = { nome: '', modalidade: 'Renda fixa' as Modalidade, valorInvestido: '', rentabilidade: '', atualizadoEm: hoje() };
  const [f, setF] = useState(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!aberto) return;
    setErros({});
    setF(editando
      ? {
        nome: editando.nome,
        modalidade: editando.modalidade,
        valorInvestido: String(editando.valorInvestido).replace('.', ','),
        rentabilidade: String(editando.rentabilidade).replace('.', ','),
        atualizadoEm: editando.atualizadoEm,
      }
      : vazio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, editando]);

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.nome.trim()) er.nome = 'Informe o nome do ativo.';
    const valor = parseBRL(f.valorInvestido);
    if (!valor || valor <= 0) er.valorInvestido = 'Informe o valor investido.';
    setErros(er);
    if (Object.keys(er).length) return;

    const inv: Investimento = {
      id: editando?.id ?? uid(),
      nome: f.nome.trim(),
      modalidade: f.modalidade,
      valorInvestido: valor,
      rentabilidade: parseBRL(f.rentabilidade),
      atualizadoEm: f.atualizadoEm || hoje(),
      ativo: editando?.ativo ?? true,
    };
    dispatch(editando ? { t: 'inv.upd', inv } : { t: 'inv.add', inv });
    avisar(editando ? 'Investimento atualizado.' : 'Investimento cadastrado.');
    onFechar();
  };

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo={editando ? 'Editar investimento' : 'Cadastrar investimento'}
      descricao="Cadastro manual. O contAI não possui integração ativa com corretoras."
    >
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Campo rotulo="Nome do ativo" erro={erros.nome}>
          <Entrada value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Tesouro Selic 2029" autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Modalidade">
            <Selecao value={f.modalidade} onChange={(e) => setF({ ...f, modalidade: e.target.value as Modalidade })}>
              {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Valor investido (R$)" erro={erros.valorInvestido}>
            <Entrada value={f.valorInvestido} onChange={(e) => setF({ ...f, valorInvestido: e.target.value })} inputMode="decimal" placeholder="5.000,00" />
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Rentabilidade acumulada (%)" dica="Informada por você — não há cotação automática.">
            <Entrada value={f.rentabilidade} onChange={(e) => setF({ ...f, rentabilidade: e.target.value })} inputMode="decimal" placeholder="8,24" />
          </Campo>
          <Campo rotulo="Última atualização">
            <Entrada type="date" value={f.atualizadoEm} onChange={(e) => setF({ ...f, atualizadoEm: e.target.value })} />
          </Campo>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary">{editando ? 'Salvar' : 'Cadastrar'}</button>
        </div>
      </form>
    </Modal>
  );
}

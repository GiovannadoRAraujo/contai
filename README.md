# contAI — organização financeira pessoal com IA

Aplicativo web no estilo **Dark Neon Finance Dashboard**, construído a partir da imagem de
referência `dashboard.png`. React + TypeScript + Vite + Tailwind CSS + Recharts + Lucide.

## Como executar

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

Conta de demonstração: **ana.souza@exemplo.com** / **contai123**
(o botão “Preencher automaticamente” na tela de login faz isso para você).

Outros comandos:

```bash
npm run build      # build de produção em dist/
npm run preview    # serve o build
npm run typecheck  # checagem de tipos
```

## O que está implementado

| Área | Situação |
| --- | --- |
| Login, cadastro e recuperação de senha | Funcional **localmente** (validação no navegador, sem backend) |
| Dashboard (5 cards, 3 gráficos, alertas, investimentos, ações rápidas) | Funcional, alimentado pelo estado real do app |
| Movimentações (CRUD, busca, filtros, ordenação, origem, CSV) | Funcional |
| Faturas (upload, pré-visualização, análise, revisão, importação) | Fluxo completo; a **extração** roda em modo demonstração |
| Assistente contAI (chat) | Funcional com motor local sobre os seus dados |
| Investimentos (carteira, cadastro manual, simulador, educação) | Funcional |
| Planejamento (orçamento, limites, metas, recorrentes, previstas) | Funcional |
| Configurações (conta, privacidade/LGPD, contas, categorias, dados) | Funcional |
| Versão mobile (layout próprio + navegação inferior) | Funcional |

### Persistência

Todo o estado é salvo em `localStorage` (`contai.estado.v1`). Não há servidor: os dados ficam
no navegador do dispositivo e podem ser exportados ou apagados em **Configurações › Meus dados**.

## Integrações que dependem de credenciais

Nenhuma chave de API é lida ou armazenada no frontend. A camada de serviços (`src/lib/documentos.ts`
e `src/lib/assistente.ts`) chama um backend próprio definido por variável de ambiente:

```bash
cp .env.example .env
# VITE_IA_ENDPOINT=https://seu-backend.exemplo.com/api
```

Esse backend deve expor:

- `POST {VITE_IA_ENDPOINT}/documentos/analisar` — recebe `multipart/form-data` com o campo
  `arquivo` e devolve um `DocumentoAnalisado` (ver `src/types.ts`), executando OCR + modelo de
  linguagem no servidor.
- `POST {VITE_IA_ENDPOINT}/assistente` — recebe `{ pergunta, periodo, contexto }` e devolve
  `{ texto, detalhe?, sugestoes? }`.

**Sem essa variável, o app roda em modo demonstração**, sinalizado na interface:

- a leitura de documentos é gerada localmente (determinística por arquivo) e cada documento
  analisado aparece com o selo “Extração de demonstração”; nenhum arquivo sai do dispositivo;
- o assistente usa um motor de regras local que lê apenas os dados do próprio aplicativo.

As taxas de referência do simulador (CDI, Selic, IPCA) são valores **armazenados no código**
(`src/lib/simulador.ts`), com fonte e data informadas na tela. Não há integração com fonte de
taxas em tempo real — o usuário pode ajustar a taxa manualmente.

Não existe integração com corretoras: os investimentos são cadastrados manualmente e a
rentabilidade é a informada pelo próprio usuário.

## Estrutura

```
src/
  lib/            regras financeiras, classificador, leitura de documentos, simulador, assistente
  store/          estado global (reducer + localStorage) e navegação
  components/     UI, gráficos, formulários, revisão de importação, simulador
  pages/          Dashboard, Movimentações, Faturas, Planejamento, Investimentos, Assistente, Configurações, Login
  data/           base de demonstração
```

## Para colocar em produção

1. **Backend de IA**: implementar os dois endpoints acima com OCR e LLM do lado do servidor,
   guardando as credenciais fora do frontend.
2. **Autenticação e banco**: substituir a autenticação local por um provedor (ex.: Supabase Auth)
   e migrar o estado de `localStorage` para um banco com controle de acesso por usuário.
3. **Armazenamento de documentos**: enviar os arquivos para um bucket privado com URLs assinadas,
   antivírus e política de retenção; hoje os arquivos só existem como `object URL` na sessão.
4. **Fonte de taxas**: integrar com B3/Banco Central para CDI, Selic e IPCA, exibindo a data de
   atualização real.
5. **Segurança e LGPD**: criptografia em repouso, trilha de auditoria, termos e política de
   privacidade reais, fluxo de exclusão de conta no servidor.
6. **Qualidade**: testes automatizados das regras financeiras e do simulador, monitoramento de
   erros e divisão do bundle (hoje ~650 kB no chunk principal).

> Projeções do simulador são estimativas ilustrativas: não garantem rentabilidade futura e não
> constituem oferta ou recomendação de investimento.

# contAI — organização financeira pessoal com IA

Aplicativo web no estilo **Dark Neon Finance Dashboard**, seguindo a imagem de referência
`Dashboard Financeiro contAI em Neon.png`. React + TypeScript + Vite + Tailwind CSS + Recharts + Lucide.

**Acesso com conta:** com o Supabase configurado (como em produção), o site abre numa tela de entrada —
Entrar / Criar conta, com aceite obrigatório dos Termos de uso e da Política de privacidade — e cada pessoa
tem os próprios dados, sincronizados entre aparelhos. Sem o Supabase configurado (ex.: `npm run dev` sem
`.env.local`), o app roda só com dados locais, sem login.

## Como executar

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # build de produção em dist/
npm run preview    # serve o build
npm run typecheck  # checagem de tipos
npm test           # testes do app (documentos, simulador, mesclagem da sincronização)
npm run test:db    # testes das migrações em PGlite (RLS, sincronização, exclusão de conta)
```

## Funcionalidades

| Área | Situação |
| --- | --- |
| Dashboard (5 cards, 3 gráficos, alertas, investimentos, ações rápidas) | Calculado a partir dos registros salvos |
| Movimentações (CRUD, busca, filtros, ordenação, origem, CSV) | Funcional |
| Faturas: upload (arrastar, galeria, câmera), pré-visualização, validação | Funcional |
| Leitura de documentos | **Local**: PDF com texto via pdf.js, imagens/PDF escaneado via OCR (Tesseract) |
| Classificação, dúvidas, revisão editável, duplicidade, pagamento de fatura | Funcional (regras + aprendizado com correções) |
| Assistente contAI com memória persistente | Motor local de cálculo — sem modelo de linguagem externo |
| Investimentos (cadastro manual, carteira, evolução estimada) | Funcional |
| Simulador (CDI, Prefixado, IPCA+, Selic, Personalizado) | Funcional, IR por aporte, IOF, custódia, premissas |
| Taxas CDI/Selic/IPCA | Consulta real à API pública do Banco Central (SGS), com fallback ilustrativo |
| Planejamento (orçamento, limites, metas, recorrentes, previstas) | Funcional |
| Backup (exportar/importar com validação), CSV, apagar tudo | Funcional |
| Versão mobile (layout próprio + navegação inferior) | Funcional |
| Conta opcional e sincronização entre aparelhos | Funcional no app; **exige aplicar a migração e configurar o Supabase** (abaixo) |

## Armazenamento e backup

- Todos os dados ficam no **IndexedDB** do navegador (banco `contai`): um store por coleção
  (movimentações, contas, faturas, documentos, investimentos, metas, orçamentos, recorrentes,
  categorias, regras, correções, conversas), `kv` para preferências e memória do assistente e
  `arquivos` para o conteúdo das faturas enviadas.
- Os registros têm `id`, `criadoEm` e `modificadoEm`; as gravações são incrementais.
- O app carrega tudo do IndexedDB antes de calcular qualquer indicador.
- **Backup:** Configurações › Backup e exportação › *Exportar backup* gera um `.json` (opcionalmente
  com os arquivos das faturas). *Importar backup* valida todo o arquivo antes de substituir os dados.
- **Dados de demonstração** só entram quando você pede, ficam marcados como “Demo” e podem ser removidos
  sem afetar os registros reais.

### Sem conta (padrão)

- Os dados existem só naquele navegador/dispositivo: não há sincronização nem backup na nuvem.
- Quem usar o mesmo navegador vê os dados. Publicar o app na internet **não** cria contas privadas:
  cada visitante tem os próprios dados locais.
- Limpar os dados do site, usar janela anônima ou o navegador descartar o armazenamento apaga tudo —
  exporte backups. Configurações permite pedir armazenamento persistente.

## Conta e sincronização

- **Tela de entrada** (`src/components/TelaEntrada.tsx`): Entrar, Criar conta e Esqueci a senha. A caixa
  "Li e concordo com os Termos de uso e a Política de privacidade" é obrigatória nos dois; a versão aceita
  e a data ficam nos metadados do usuário (`termos_versao`, `termos_aceitos_em`).
- **Termos e privacidade** (`src/pages/Privacidade.tsx`, rota pública `#/privacidade`). Ao mudar o texto,
  aumente `TERMOS_VERSAO` em `src/lib/legal.ts`. **Preencha `CONTATO_PRIVACIDADE`** com o e-mail do
  responsável antes de abrir para o público (hoje aparece "a ser divulgado").
- **Mesmo aparelho, pessoas diferentes:** ao sair (ou excluir a conta) a cópia local é apagada; se outra conta
  entrar num aparelho que tinha dados de alguém, esses dados são apagados antes de sincronizar.
- Em **Configurações › Conta e sincronização**: status, sincronizar agora, sair e excluir a conta com todos os
  dados do servidor.

- **Local-first:** tudo continua sendo gravado primeiro no IndexedDB. Com a conta conectada, cada alteração
  entra numa fila persistente e sobe em segundo plano; sem internet, espera e sobe quando a conexão volta.
- **Conflitos:** vale a alteração mais recente (`modificadoEm`), decidida no servidor. Exclusões viajam como
  marcas de exclusão. Dados de demonstração nunca sobem.
- **Primeiro login num aparelho:** o que já existe nele é enviado e se junta à conta — nada é apagado.
- **O que sincroniza:** todos os registros, arquivos das faturas (bucket privado), histórico e memória do
  assistente, regras e correções, e as preferências compartilháveis (o consentimento de envio a IA externa
  e o aviso de privacidade continuam por aparelho).
- **Segurança:** só a chave publicável vai para o navegador (o app se recusa a iniciar com uma chave
  secreta). RLS no banco: cada usuário só lê e grava as próprias linhas; `anon` não tem acesso.
  Não há criptografia de ponta a ponta — o administrador do projeto Supabase tem acesso técnico ao banco.

### Como ativar

1. **Aplicar a migração** `supabase/migrations/20261015120000_sincronizacao.sql` no projeto Supabase
   (cria `registros_sync`, as funções `sincronizar_registros` e `excluir_minha_conta`, o bucket privado
   `documentos` e as políticas). Com a CLI: `npx supabase@latest login`, `npx supabase@latest link` e
   `npx supabase@latest db push`. As tabelas tipadas das migrações 001–003 continuam lá, sem uso.
2. **Auth › Providers › Email:** ativar e-mail e senha e a confirmação de e-mail; senha mínima de 8 caracteres.
3. **Auth › URL Configuration:** *Site URL* `https://contai-silk.vercel.app` e, em *Redirect URLs*, o mesmo
   endereço e `http://localhost:5173`.
4. **Auth › SMTP:** configurar um provedor de e-mail (Resend, Brevo, SES…). O envio padrão do Supabase
   tem limite muito baixo de e-mails por hora e não serve para usuários reais.
5. **Vercel › Settings › Environment Variables:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
   (a chave **publicável**, `sb_publishable_…`), e fazer um novo deploy.

Sem essas variáveis, o cartão de conta explica que a sincronização não está configurada e o app segue só local.

## Integrações

- **Nenhuma chave de API está no frontend.**
- **Serviço de IA (opcional):** `VITE_IA_ENDPOINT` aponta para um backend próprio (não incluído) com
  `POST /documentos/analisar` (multipart, campo `arquivo`, retorna `DocumentoAnalisado`) e
  `POST /assistente` (recebe a pergunta e a resposta já calculada localmente). Só é usado com o
  consentimento explícito do usuário para envio externo. Sem ele, tudo roda localmente.
- **OCR:** na primeira leitura de imagem, o Tesseract baixa o motor e o modelo de português da CDN
  jsDelivr (o documento em si não sai do navegador).
- **Taxas:** API pública do Banco Central (séries 432, 4389 e 13522), sem credenciais.
- Não há integração com bancos ou corretoras.

## Para produção

1. Backend de IA (OCR + LLM) com as credenciais no servidor, política de retenção e consentimento.
2. Concluir a ativação da conta (acima), com SMTP próprio, política de privacidade e termos (LGPD).
3. Criptografia local opcional (ex.: senha de bloqueio do app) para dispositivos compartilhados.
4. Hospedar o worker e o modelo do Tesseract junto com o app para não depender da CDN.
5. Divisão do bundle (Recharts no chunk principal) e monitoramento de erros.
6. Testes E2E automatizados no CI.

> Projeções do simulador são estimativas ilustrativas: não garantem rentabilidade futura e não
> constituem oferta ou recomendação de investimento.

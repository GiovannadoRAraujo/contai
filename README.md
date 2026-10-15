# contAI — organização financeira pessoal com IA

Aplicativo web no estilo **Dark Neon Finance Dashboard**, seguindo a imagem de referência
`Dashboard Financeiro contAI em Neon.png`. React + TypeScript + Vite + Tailwind CSS + Recharts + Lucide.

**Acesso aberto:** não há login, cadastro nem autenticação. O endereço abre direto no dashboard.

## Como executar

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # build de produção em dist/
npm run preview    # serve o build
npm run typecheck  # checagem de tipos
npm test           # testes (interpretador de documentos e simulador)
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

### Limitações do acesso sem autenticação

- Os dados existem só naquele navegador/dispositivo: não há sincronização nem backup na nuvem.
- Quem usar o mesmo navegador vê os dados. Publicar o app na internet **não** cria contas privadas:
  cada visitante tem os próprios dados locais.
- Limpar os dados do site, usar janela anônima ou o navegador descartar o armazenamento apaga tudo —
  exporte backups. Configurações permite pedir armazenamento persistente.

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
2. Se houver sincronização/banco remoto, implementar isolamento por usuário — o que exige alguma forma
   de identificação; enquanto o requisito de acesso aberto vigorar, os dados permanecem locais.
3. Criptografia local opcional (ex.: senha de bloqueio do app) para dispositivos compartilhados.
4. Hospedar o worker e o modelo do Tesseract junto com o app para não depender da CDN.
5. Divisão do bundle (Recharts no chunk principal) e monitoramento de erros.
6. Testes E2E automatizados no CI.

> Projeções do simulador são estimativas ilustrativas: não garantem rentabilidade futura e não
> constituem oferta ou recomendação de investimento.

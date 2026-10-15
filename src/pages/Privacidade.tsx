import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import Logo from '@/components/Logo';
import { CONTATO_PRIVACIDADE, TERMOS_VERSAO, TERMOS_VIGENCIA } from '@/lib/legal';

/**
 * Termos de uso e Política de privacidade do contAI.
 * Página pública: abre mesmo sem login (#/privacidade).
 */
export default function Privacidade({ onVoltar }: { onVoltar: () => void }) {
  const contato = CONTATO_PRIVACIDADE
    ? <a className="font-semibold text-roxo-luz" href={`mailto:${CONTATO_PRIVACIDADE}`}>{CONTATO_PRIVACIDADE}</a>
    : <span className="text-laranja">canal de contato a ser divulgado pelo responsável</span>;

  return (
    <div className="relative z-10 min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo tamanho={28} />
          <button type="button" onClick={onVoltar} className="btn-ghost py-2 text-[12.5px]">
            <ArrowLeft size={15} /> Voltar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <h1 className="text-[26px] font-bold tracking-tight text-txt">Termos de uso e Política de privacidade</h1>
        <p className="mt-1 text-[13px] text-txt3">Vigente desde {TERMOS_VIGENCIA} · versão {TERMOS_VERSAO}</p>

        <nav className="mt-5 flex flex-wrap gap-2 text-[12.5px]">
          {/* botões, não links com #: o hash da URL é usado pela navegação do app */}
          <button type="button" className="chip" onClick={() => document.getElementById('termos')?.scrollIntoView({ behavior: 'smooth' })}>
            <FileText size={13} /> Termos de uso
          </button>
          <button type="button" className="chip" onClick={() => document.getElementById('politica')?.scrollIntoView({ behavior: 'smooth' })}>
            <ShieldCheck size={13} /> Política de privacidade
          </button>
        </nav>

        <article className="mt-6 space-y-8 text-[14px] leading-relaxed text-txt2 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:text-txt [&_h3]:mt-5 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:text-txt [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p]:mt-2 [&_strong]:text-txt [&_ul]:mt-2 [&_ul]:space-y-1">
          <section id="termos" className="scroll-mt-20 rounded-2xl border border-line/70 bg-card p-5 sm:p-6">
            <h2>Termos de uso</h2>

            <h3>1. O que é o contAI</h3>
            <p>
              O contAI é uma ferramenta de organização financeira pessoal: registra receitas e despesas, lê faturas e
              extratos que você envia, calcula indicadores, simula rendimentos e responde perguntas sobre os seus próprios
              registros. Para usar, é preciso criar uma conta com e-mail e senha e aceitar estes termos.
            </p>

            <h3>2. O contAI não é consultoria financeira</h3>
            <ul>
              <li>As informações têm caráter organizacional e educativo. Não são recomendação, oferta ou consultoria de investimentos.</li>
              <li>Simulações de rendimento são estimativas com taxas constantes e <strong>não garantem rentabilidade futura</strong>.</li>
              <li>A leitura de documentos (texto de PDF e reconhecimento de imagem) e a classificação automática podem errar.
                Você revisa e aprova cada lançamento antes da importação e é responsável por conferir os valores.</li>
            </ul>

            <h3>3. Sua conta</h3>
            <ul>
              <li>Use um e-mail que você controla e uma senha forte, sem compartilhá-la. Você responde pelo uso feito com a sua conta.</li>
              <li>Cadastre apenas os seus próprios dados financeiros, ou dados de terceiros que você tenha autorização para registrar.</li>
              <li>O serviço é destinado a maiores de 18 anos.</li>
              <li>Você pode excluir a conta a qualquer momento em Configurações › Conta e sincronização; isso apaga os dados do servidor.</li>
            </ul>

            <h3>4. Uso permitido</h3>
            <p>
              É proibido tentar acessar dados de outras pessoas, contornar as proteções do sistema, sobrecarregar o serviço
              ou usá-lo para atividades ilícitas. Contas usadas dessa forma podem ser suspensas ou encerradas.
            </p>

            <h3>5. Disponibilidade</h3>
            <p>
              O contAI é oferecido como está, sem garantia de funcionamento ininterrupto. Mantenha cópias de segurança
              (Configurações › Backup e exportação). Funcionalidades podem ser alteradas, suspensas ou descontinuadas.
            </p>

            <h3>6. Alterações destes termos</h3>
            <p>
              Mudanças relevantes geram uma nova versão destes termos, e o aceite será pedido de novo no próximo acesso.
            </p>
          </section>

          <section id="politica" className="scroll-mt-20 rounded-2xl border border-line/70 bg-card p-5 sm:p-6">
            <h2>Política de privacidade</h2>
            <p>
              Esta política explica como o contAI trata dados pessoais, em conformidade com a Lei Geral de Proteção de
              Dados (Lei nº 13.709/2018 — LGPD).
            </p>

            <h3>1. Quais dados tratamos</h3>
            <ul>
              <li><strong>Dados de conta:</strong> e-mail, senha (guardada apenas de forma cifrada pelo provedor de autenticação), datas de cadastro e de acesso, e a data e a versão em que você aceitou estes termos.</li>
              <li><strong>Dados financeiros que você registra:</strong> movimentações, contas e cartões, faturas, metas, orçamentos, contas recorrentes, investimentos e categorias.</li>
              <li><strong>Documentos que você envia:</strong> fotos, prints e PDFs de faturas, extratos e contas, e as transações extraídas deles.</li>
              <li><strong>Uso do assistente:</strong> histórico de conversas, preferências que você pede para lembrar, regras e correções de classificação.</li>
              <li><strong>Dados técnicos:</strong> endereço IP e informações do navegador registrados pelos provedores de infraestrutura para funcionamento e segurança.</li>
            </ul>
            <p>Não pedimos CPF, dados de cartão para pagamento nem senhas de banco, e o contAI não se conecta às suas contas bancárias.</p>

            <h3>2. Para que usamos</h3>
            <ul>
              <li>Prestar o serviço: guardar e sincronizar os seus registros entre aparelhos, calcular indicadores e responder às suas perguntas.</li>
              <li>Autenticar o acesso e proteger a sua conta.</li>
              <li>Enviar e-mails de serviço (confirmação de cadastro e recuperação de senha). Não enviamos publicidade.</li>
            </ul>
            <p>
              Bases legais: execução do serviço que você contratou ao criar a conta (art. 7º, V) e o seu consentimento
              (art. 7º, I), que pode ser revogado a qualquer momento com a exclusão da conta.
            </p>

            <h3>3. Onde os dados ficam</h3>
            <ul>
              <li><strong>No seu aparelho:</strong> uma cópia fica no armazenamento do navegador (IndexedDB), para o app funcionar mesmo sem internet. Ao sair da conta, essa cópia é apagada do aparelho.</li>
              <li><strong>No servidor:</strong> no banco de dados e no armazenamento de arquivos do Supabase, na região de São Paulo (Brasil). Cada usuário só consegue acessar as próprias informações, por regras aplicadas no próprio banco de dados.</li>
              <li>O site é hospedado na Vercel. As fontes de texto são carregadas do Google Fonts, que recebe o endereço IP de quem acessa a página.</li>
            </ul>

            <h3>4. Com quem compartilhamos</h3>
            <p>Não vendemos nem alugamos seus dados. Eles são tratados apenas por fornecedores necessários ao funcionamento:</p>
            <ul>
              <li><strong>Supabase</strong> — autenticação, banco de dados e armazenamento de arquivos.</li>
              <li><strong>Vercel</strong> — hospedagem do site.</li>
              <li><strong>Serviço externo de inteligência artificial</strong> — só quando estiver configurado <em>e</em> você autorizar o envio em Configurações › Privacidade. Hoje a leitura de documentos acontece no seu próprio navegador.</li>
            </ul>
            <p>
              Consultas de taxas ao Banco Central e o download do leitor de imagens (jsDelivr) não enviam nenhum dado seu.
              Também podemos compartilhar dados quando exigido por lei ou ordem judicial.
            </p>

            <h3>5. Segurança</h3>
            <p>
              Conexões cifradas (HTTPS), isolamento dos dados por usuário no banco e arquivos em área privada. Os dados não
              usam criptografia de ponta a ponta: a equipe técnica responsável pela infraestrutura tem acesso administrativo
              ao banco, usado apenas para manutenção e segurança. Nenhum sistema é totalmente imune a incidentes; havendo
              incidente relevante, os usuários afetados serão comunicados conforme a LGPD.
            </p>

            <h3>6. Por quanto tempo guardamos</h3>
            <p>
              Enquanto a sua conta existir. Ao excluir a conta, os dados de conta, os registros financeiros, a memória do
              assistente e os arquivos enviados são apagados do servidor. Registros técnicos dos provedores podem ser mantidos
              pelo prazo que a lei exigir.
            </p>

            <h3>7. Seus direitos (LGPD, art. 18)</h3>
            <ul>
              <li><strong>Acesso e portabilidade:</strong> exporte todos os seus dados em Configurações › Backup e exportação.</li>
              <li><strong>Correção:</strong> edite qualquer registro diretamente no app.</li>
              <li><strong>Exclusão e revogação do consentimento:</strong> exclua a conta em Configurações › Conta e sincronização.</li>
              <li><strong>Informações e outros pedidos:</strong> pelo {contato}.</li>
            </ul>
            <p>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

            <h3>8. Cookies e armazenamento local</h3>
            <p>
              O contAI não usa cookies de publicidade nem ferramentas de rastreamento. Usa o armazenamento do navegador
              apenas para manter a sua sessão conectada e guardar a cópia local dos seus dados.
            </p>

            <h3>9. Contato</h3>
            <p>Dúvidas sobre esta política ou sobre os seus dados: {contato}.</p>
          </section>
        </article>

        <div className="mt-8 text-center">
          <button type="button" onClick={onVoltar} className="btn-primary"><ArrowLeft size={15} /> Voltar</button>
        </div>
      </main>
    </div>
  );
}

import { Suspense, lazy } from 'react';
import { AlertTriangle, Database, ShieldCheck, X } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import MobileNav from '@/components/MobileNav';
import { Avisos, Card, Carregando, Modal } from '@/components/ui';
import { ModalInvestimento, ModalMeta, ModalMovimentacao } from '@/components/formularios';
import Simulador from '@/components/Simulador';
import Dashboard from '@/pages/Dashboard';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';

const Movimentacoes = lazy(() => import('@/pages/Movimentacoes'));
const Faturas = lazy(() => import('@/pages/Faturas'));
const Planejamento = lazy(() => import('@/pages/Planejamento'));
const Investimentos = lazy(() => import('@/pages/Investimentos'));
const Assistente = lazy(() => import('@/pages/Assistente'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));

/** Acesso aberto: não há login. O app abre direto no dashboard. */
export default function App() {
  const { rota, modal, fechar } = useNav();

  return (
    <div className="relative z-10 min-h-screen">
      <Sidebar />

      <div className="lg:pl-[232px]">
        <div className="mx-auto w-full max-w-[1360px] px-4 pb-24 pt-3 sm:px-6 lg:px-7 lg:pb-8 lg:pt-6">
          <Topbar />
          <Faixas />
          <main key={rota} className="animate-fadeUp">
            <Suspense fallback={<Card className="p-5"><Carregando linhas={4} altura={72} /></Card>}>
              {rota === 'inicio' && <Dashboard />}
              {rota === 'movimentacoes' && <Movimentacoes />}
              {rota === 'faturas' && <Faturas />}
              {rota === 'planejamento' && <Planejamento />}
              {rota === 'investimentos' && <Investimentos />}
              {rota === 'assistente' && <Assistente />}
              {rota === 'configuracoes' && <Configuracoes />}
            </Suspense>
          </main>
        </div>
      </div>

      <MobileNav />

      {/* Modais globais acionados pelas ações rápidas */}
      <ModalMovimentacao aberto={modal === 'receita'} onFechar={fechar} tipo="receita" />
      <ModalMovimentacao aberto={modal === 'despesa'} onFechar={fechar} tipo="despesa" />
      <ModalMeta aberto={modal === 'meta'} onFechar={fechar} />
      <ModalInvestimento aberto={modal === 'investimento'} onFechar={fechar} />
      <Modal
        aberto={modal === 'simulador'}
        onFechar={fechar}
        titulo="Simulador de investimentos"
        descricao="Projeções ilustrativas — não garantem rentabilidade futura."
        largura="max-w-2xl"
      >
        <Simulador compacto />
      </Modal>

      <Avisos />
    </div>
  );
}

/** Avisos persistentes: privacidade (1ª visita), dados de demonstração e falhas de gravação. */
function Faixas() {
  const { estado, dispatch, avisar, temDemo, persistencia, erroPersistencia } = useApp();
  const { ir } = useNav();

  return (
    <div className="mb-4 space-y-2 empty:mb-0">
      {persistencia === 'erro' && erroPersistencia && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rosa/40 bg-rosa/10 px-4 py-3 text-[12.5px] text-txt">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rosa" />
          <p>
            <strong className="text-rosa">Os dados não estão sendo salvos.</strong> {erroPersistencia} As alterações
            desta sessão podem se perder ao fechar a página. Exporte um backup em Configurações.
          </p>
        </div>
      )}

      {!estado.prefs.avisoPrivacidadeVisto && (
        <div className="flex items-start gap-3 rounded-xl border border-roxo/35 bg-roxo/[0.08] px-4 py-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-roxo-luz" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-txt2">
            <strong className="text-txt">Seus dados ficam neste navegador.</strong> O contAI funciona sem login: tudo é
            salvo localmente (IndexedDB) neste dispositivo, sem sincronização entre aparelhos e sem backup na nuvem.
            Quem usar este navegador consegue ver os dados. Faça backups em Configurações.{' '}
            <button type="button" className="font-semibold text-roxo-luz hover:text-txt" onClick={() => ir('configuracoes')}>
              Saiba mais
            </button>
          </p>
          <button
            type="button"
            aria-label="Entendi, fechar aviso de privacidade"
            onClick={() => dispatch({ t: 'prefs', dados: { avisoPrivacidadeVisto: true } })}
            className="shrink-0 rounded-lg px-2 py-1 text-[12px] font-semibold text-roxo-luz hover:bg-roxo/15"
          >
            <span className="hidden sm:inline">Entendi</span>
            <X size={15} className="sm:hidden" />
          </button>
        </div>
      )}

      {temDemo && (
        <div className="flex flex-col gap-2 rounded-xl border border-laranja/35 bg-laranja/[0.08] px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
          <p className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] text-txt2">
            <Database size={16} className="mt-0.5 shrink-0 text-laranja" />
            <span>
            <strong className="text-laranja">Dados de demonstração.</strong> Registros fictícios estão misturados à
            visualização e aparecem com o selo “Demo”.
            </span>
          </p>
          <button
            type="button"
            onClick={() => { dispatch({ t: 'demo.remover' }); avisar('Dados de demonstração removidos. Seus registros reais foram mantidos.'); }}
            className="self-start rounded-lg border border-laranja/40 px-3 py-1.5 text-[12px] font-semibold text-laranja hover:bg-laranja/15 sm:self-auto"
          >
            Remover dados de demonstração
          </button>
        </div>
      )}
    </div>
  );
}

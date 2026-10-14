import { Suspense, lazy } from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import MobileNav from '@/components/MobileNav';
import { Avisos, Card, Carregando, Modal } from '@/components/ui';
import { ModalInvestimento, ModalMeta, ModalMovimentacao } from '@/components/formularios';
import Simulador from '@/components/Simulador';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import { useApp } from '@/store/app';
import { useNav } from '@/store/nav';

const Movimentacoes = lazy(() => import('@/pages/Movimentacoes'));
const Faturas = lazy(() => import('@/pages/Faturas'));
const Planejamento = lazy(() => import('@/pages/Planejamento'));
const Investimentos = lazy(() => import('@/pages/Investimentos'));
const Assistente = lazy(() => import('@/pages/Assistente'));
const Configuracoes = lazy(() => import('@/pages/Configuracoes'));

export default function App() {
  const { estado } = useApp();
  const { rota, modal, fechar } = useNav();

  if (!estado.autenticado) {
    return (
      <>
        <Login />
        <Avisos />
      </>
    );
  }

  return (
    <div className="relative z-10 min-h-screen">
      <Sidebar />

      <div className="lg:pl-[232px]">
        <div className="mx-auto w-full max-w-[1320px] px-4 pb-24 pt-3 sm:px-6 lg:px-7 lg:pb-8 lg:pt-5">
          <Topbar />
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

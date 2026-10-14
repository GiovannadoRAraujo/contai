import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from '@/store/app';
import { NavProvider } from '@/store/nav';
import './index.css';

// Apenas em desenvolvimento: disponibiliza contaiSupabase() no console para
// conferir a conexão. Não roda no build de produção e não altera o aplicativo.
if (import.meta.env.DEV) {
  void import('@/lib/supabase').then((m) => m.registrarDiagnostico());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <NavProvider>
        <App />
      </NavProvider>
    </AppProvider>
  </React.StrictMode>,
);

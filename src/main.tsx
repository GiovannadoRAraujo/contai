import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from '@/store/app';
import { NavProvider } from '@/store/nav';
import { NuvemProvider } from '@/store/nuvem';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProvider>
      <NuvemProvider>
        <NavProvider>
          <App />
        </NavProvider>
      </NuvemProvider>
    </AppProvider>
  </React.StrictMode>,
);

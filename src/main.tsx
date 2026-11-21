import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import {
  ensureWritableFetchDescriptor,
  installExtensionFetchErrorGuard,
} from './lib/fetchGuard';
import './index.css';
import './barbi/barbiStyles.css';

if (typeof window !== 'undefined') {
  ensureWritableFetchDescriptor(window);
  installExtensionFetchErrorGuard(window as unknown as EventTarget & Record<string, unknown>);
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError(error) {
      console.warn('Service worker registration warning:', error);
    },
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

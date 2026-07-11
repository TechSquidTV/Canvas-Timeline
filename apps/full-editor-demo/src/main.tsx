import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/lexend/wght.css';
import { App } from '#full-editor/app/App';
import { registerServiceWorker } from '#full-editor/infrastructure/pwa/register-service-worker';
import '#full-editor/styles.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('Missing root element');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerServiceWorker();

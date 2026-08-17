// Must stay the first import: this module checks the build stamp as a side
// effect, and it has to run before any store reads localStorage.
import '@/data/bootstrapStorage';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename keeps routes working when the app is served from a sub-path. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

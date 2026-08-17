// Must stay the first import: this module starts the build-stamp check as a
// side effect, and it has to run before any store reads localStorage.
import { storageReady } from '@/data/bootstrapStorage';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// Mount once the build-stamp check has settled. When the build is unchanged
// this resolves on the first microtask; when storage had to be rebuilt it waits
// for the Golden Flow, so no screen can read a half-seeded project.
// `storageReady` never rejects.
void storageReady.then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* basename keeps routes working when the app is served from a sub-path. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});

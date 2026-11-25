import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './lib/auth';
import { FeedbackProvider } from './lib/feedback';
import { PlanProvider } from './lib/plan';
import { I18nProvider } from './lib/i18n';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
      <AuthProvider>
        <FeedbackProvider>
          <PlanProvider>
            <App />
          </PlanProvider>
        </FeedbackProvider>
      </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

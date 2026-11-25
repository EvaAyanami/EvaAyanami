import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const env = (k: string, d = '') => process.env[k] ?? d;

export const config = {
  appName: env('APP_NAME', 'Codemori'),
  port: Number(env('PORT', '4000')),
  host: env('HOST', '0.0.0.0'),
  production: env('NODE_ENV') === 'production',
  publicUrl: env('PUBLIC_URL', 'http://localhost:5173'),
  cookieSecure: env('COOKIE_SECURE', env('NODE_ENV') === 'production' ? 'true' : 'false') === 'true',
  sessionDays: Number(env('SESSION_DAYS', '30')),
  runnerUrl: env('RUNNER_URL', 'http://localhost:4100'),
  runnerToken: env('RUNNER_TOKEN', ''),
  contentDir: resolve(env('CONTENT_DIR', resolve(here, '../../../content'))),
  webDist: env('WEB_DIST', ''),
  autoImport: env('CONTENT_AUTO_IMPORT', 'true') === 'true',
  allowRegistration: env('ALLOW_REGISTRATION', 'true') === 'true',
  adminEmail: env('ADMIN_EMAIL', ''),
  adminPassword: env('ADMIN_PASSWORD', ''),
  ai: {
    provider: env('AI_PROVIDER', 'none'), // none | openai | ollama
    baseUrl: env('AI_BASE_URL', ''),
    apiKey: env('AI_API_KEY', ''),
    model: env('AI_MODEL', ''),
  },
  /** Clé de chiffrement des secrets de double authentification (à défaut : dérivée du jeton du runner). */
  appSecret: env('APP_SECRET', env('RUNNER_TOKEN', 'codemori-dev-secret')),
  stripe: {
    secretKey: env('STRIPE_SECRET_KEY'),
    priceId: env('STRIPE_PRICE_ID'),
    webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
  },
  /**
   * Publicités rémunérées. ADS_PROVIDER : house (annonces maison, sans revenu) ou adsense.
   * Avec AdSense, l'éditeur (toi) est payé par Google pour les affichages et clics.
   */
  ads: {
    provider: env('ADS_PROVIDER', 'house') as 'house' | 'adsense',
    adsenseClient: env('ADSENSE_CLIENT'), // ca-pub-XXXXXXXXXXXXXXXX
    adsenseSlotReward: env('ADSENSE_SLOT_REWARD'), // bloc affiché pendant la pub récompensée
    adsenseSlotBanner: env('ADSENSE_SLOT_BANNER'), // bannière discrète pour les comptes gratuits
  },
  runLimitPerMinute: Number(env('RUN_LIMIT_PER_MINUTE', '20')),
};

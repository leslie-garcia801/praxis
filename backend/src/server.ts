import { createApp } from './app.js';
import { env } from './config/env.js';
import { AVISO_PUSH_APAGADO, pushApagado } from './lib/push.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  if (pushApagado()) console.warn(AVISO_PUSH_APAGADO);
});

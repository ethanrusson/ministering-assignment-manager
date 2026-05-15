import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { installGlobalErrorReporting, pushError } from './lib/errorToast';
import './styles.css';

installGlobalErrorReporting();

const app = createApp(App);
app.config.errorHandler = (err) => {
  console.error('[vue error]', err);
  pushError(err);
};
app.use(createPinia());
app.use(router);
app.mount('#app');

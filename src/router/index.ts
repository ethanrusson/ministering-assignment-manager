import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const Home = () => import('@/views/Home.vue');
const Login = () => import('@/views/Login.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: Login },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.init();
  if (to.meta.requiresAuth && !auth.user) return { name: 'login' };
  if (to.name === 'login' && auth.user) return { name: 'home' };
  return true;
});

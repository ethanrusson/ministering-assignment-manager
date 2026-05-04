import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const Home = () => import('@/views/Home.vue');
const Login = () => import('@/views/Login.vue');
const Signup = () => import('@/views/Signup.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: Home, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: Login },
    { path: '/signup', name: 'signup', component: Signup },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.ready) await auth.init();
  if (to.meta.requiresAuth && !auth.user) return { name: 'login' };
  if ((to.name === 'login' || to.name === 'signup') && auth.user) return { name: 'home' };
  return true;
});

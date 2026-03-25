import { createRouter, createRoute, createRootRoute, redirect } from '@tanstack/react-router';
import { Layout } from './components/layout';
import { LoginPage } from './pages/login';
import { ChatPage } from './pages/chat';
import { RenderPage } from './pages/render';
import { AccountPage } from './pages/account';
import { AdminPage } from './pages/admin';
import { ResetPasswordPage } from './pages/reset-password';
import { isAuthenticated, parseToken } from './lib/auth';

const rootRoute = createRootRoute({
  component: Layout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/chat' });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatPage,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
  },
});

const renderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/render',
  component: RenderPage,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
  },
});

const accountRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/account',
  component: AccountPage,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
  },
});

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminPage,
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: '/login' });
    const payload = parseToken();
    if (payload?.role !== 'admin') throw redirect({ to: '/chat' });
  },
});

const resetPasswordRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || '',
  }),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  chatRoute,
  renderRoute,
  accountRoute,
  adminRoute,
  resetPasswordRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

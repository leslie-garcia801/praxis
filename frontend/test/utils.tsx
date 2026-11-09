import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../src/router';

// Renders the real route tree at `path` with a fresh query cache.
export function renderApp(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // delay: null types without a timer between keystrokes. The default (delay: 0) yields to the
  // event loop on every key, which made multi-step forms exceed the 5 s timeout on a loaded machine.
  return { router, queryClient, user: userEvent.setup({ delay: null }) };
}

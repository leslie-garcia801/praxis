import { vi } from 'vitest';

// Fakes of the browser push APIs for one test. `resetPushMocks` (called from test/setup.ts after each test)
// removes everything installed here, so jsdom goes back to "no service worker, no push".

type PushMockOptions = {
  permission?: NotificationPermission;
  // What the user answers when the permission prompt shows.
  answer?: NotificationPermission;
  subscribed?: boolean;
  // false: there is no service worker registration, as in `pnpm dev`.
  registration?: boolean;
};

const ENDPOINT = 'https://push.example.test/abc123';
const OWN_PROPS = ['serviceWorker', 'userAgent', 'standalone', 'platform', 'maxTouchPoints'] as const;

export function defineNavigator(name: (typeof OWN_PROPS)[number], value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true });
}

export function installPush({
  permission = 'default',
  answer = 'granted',
  subscribed = false,
  registration = true,
}: PushMockOptions = {}) {
  let current: typeof subscription | null = null;
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, expirationTime: null, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn(async () => {
      current = null;
      return true;
    }),
  };
  if (subscribed) current = subscription;

  const subscribe = vi.fn(async (_options: PushSubscriptionOptionsInit) => {
    current = subscription;
    return subscription;
  });
  const getSubscription = vi.fn(async () => current);
  const getRegistration = vi.fn(async () => (registration ? { pushManager: { subscribe, getSubscription } } : undefined));

  let currentPermission = permission;
  const requestPermission = vi.fn(async () => {
    currentPermission = answer;
    return answer;
  });
  const FakeNotification = {
    get permission() {
      return currentPermission;
    },
    requestPermission,
  };

  defineNavigator('serviceWorker', { getRegistration });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', FakeNotification);

  return { subscribe, getSubscription, getRegistration, requestPermission, subscription, endpoint: ENDPOINT };
}

export function asIphone({ installed }: { installed: boolean }) {
  defineNavigator('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1');
  defineNavigator('standalone', installed);
}

export function resetPushMocks() {
  vi.unstubAllGlobals();
  for (const name of OWN_PROPS) Reflect.deleteProperty(navigator, name);
}

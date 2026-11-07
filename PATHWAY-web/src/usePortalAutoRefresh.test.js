import { act, renderHook } from '@testing-library/react';
import usePortalAutoRefresh from './usePortalAutoRefresh';
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
test('paused polling performs no reads on timers, focus, reconnect, visibility or scope changes', async () => {
  const refresh = jest.fn();
  const { rerender, unmount } = renderHook(({ scope }) => usePortalAutoRefresh(refresh, { scope, enabled: true }), { initialProps: { scope: 'a' } });
  await act(async () => {
    jest.advanceTimersByTime(3600000);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  rerender({ scope: 'b' });
  await act(async () => { jest.advanceTimersByTime(60000); });
  expect(refresh).not.toHaveBeenCalled();
  unmount();
});

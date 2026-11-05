import { act, renderHook } from '@testing-library/react';
import usePortalAutoRefresh from './usePortalAutoRefresh';
beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.useRealTimers(); document.body.innerHTML = ''; });
test('updates without reloading, serializes reads, and invalidates a departed scope', async () => {
  let finish;
  const refresh = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  const { rerender, unmount } = renderHook(({ scope }) => usePortalAutoRefresh(refresh, { scope }), { initialProps: { scope: 'a' } });
  await act(async () => { jest.advanceTimersByTime(30000); });
  expect(refresh).toHaveBeenCalledTimes(1);
  const old = refresh.mock.calls[0][0];
  expect(old.silent).toBe(true); expect(old.isCurrent()).toBe(true);
  rerender({ scope: 'b' }); expect(old.isCurrent()).toBe(false);
  await act(async () => { finish(); });
  unmount(); await act(async () => { jest.advanceTimersByTime(10000); });
  expect(refresh).toHaveBeenCalledTimes(1);
});
test('pauses while editing or disabled and checks immediately on focus', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const { rerender } = renderHook(({ enabled }) => usePortalAutoRefresh(refresh, { enabled }), { initialProps: { enabled: false } });
  await act(async () => { jest.advanceTimersByTime(10000); }); expect(refresh).not.toHaveBeenCalled();
  rerender({ enabled: true });
  const input = document.createElement('input'); document.body.appendChild(input); input.focus();
  await act(async () => { jest.advanceTimersByTime(10000); }); expect(refresh).not.toHaveBeenCalled();
  input.blur();
  await act(async () => { window.dispatchEvent(new Event('focus')); }); expect(refresh).toHaveBeenCalledTimes(1);
});
test('messages may update while composing, but open dialogs pause reads', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  renderHook(() => usePortalAutoRefresh(refresh, { protectInputs: false }));
  const input = document.createElement('textarea'); document.body.appendChild(input); input.focus();
  await act(async () => { jest.advanceTimersByTime(10000); }); expect(refresh).toHaveBeenCalledTimes(1);
  const dialog = document.createElement('dialog'); dialog.setAttribute('open',''); document.body.appendChild(dialog);
  await act(async () => { jest.advanceTimersByTime(10000); }); expect(refresh).toHaveBeenCalledTimes(1);
});

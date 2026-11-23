import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCount } from '@konradmichalik/pagetree-facets/Filter/live-count.js';

/*
 * The timing of the live count on its own, with fake timers: the skeleton that
 * is only shown for a request slow enough to be noticed. The round trip through
 * the modal runs on real timers in facets-modal-live-count.test.js.
 */

const mount = ({ request = () => new Promise(() => {}), isActive = () => true } = {}) => {
  const status = { showLoading: vi.fn(), hideLoading: vi.fn(), setCount: vi.fn() };
  const count = new LiveCount({ status, request, isActive, hasFilter: () => true });

  return { status, count };
};

describe('the delayed skeleton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows once the request has been in flight for the delay', async () => {
    const { status, count } = mount();

    count.refreshNow();
    await vi.advanceTimersByTimeAsync(9);
    expect(status.showLoading).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(status.showLoading).toHaveBeenCalledTimes(1);
  });

  it('is not shown for a request a newer one overtook within the delay', async () => {
    const { status, count } = mount();

    count.refreshNow();
    await vi.advanceTimersByTimeAsync(5);
    count.refreshNow();
    await vi.advanceTimersByTimeAsync(6);
    expect(status.showLoading).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(4);
    expect(status.showLoading).toHaveBeenCalledTimes(1);
  });

  it('is not shown once the count stopped applying inside the delay', async () => {
    let active = true;
    const { status, count } = mount({ isActive: () => active });

    count.refreshNow();
    active = false;
    await vi.advanceTimersByTimeAsync(10);

    expect(status.showLoading).not.toHaveBeenCalled();
  });
});

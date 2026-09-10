// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';

const groups = [
  { name: 'Projects', total: 1, items: [{ id: 'p-budget', kind: 'project', title: 'Budget', detail: 'New thread' }] },
  { name: 'Active threads', total: 1, items: [{ id: 't-running', kind: 'thread', title: 'Running task', detail: 'Budget' }] },
  { name: 'Inactive threads', total: 0, items: [] },
  { name: 'Settled threads', total: 0, items: [] },
];
const entries = groups.flatMap(group => group.items.map(item => ({ group: group.name, item, recency: 0, extra: '' })));
let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  app = await loadPluginApp(() => import('./app'));
});
afterEach(() => cleanup());
function open() { act(() => { window.dispatchEvent(new Event('bb-spotlight:open')); }); }

describe('Spotlight overlay', () => {
  it('renders four groups and navigates projects to the project compose route', async () => {
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog: () => ({ entries }) } });
    open();
    const input = await slot.findByRole('combobox');
    await slot.findByRole('option', { name: /Budget New thread/ });
    expect(slot.getAllByRole('group')).toHaveLength(4);
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(slot.inspection.navigateCalls).toContainEqual({ method: 'toProject', projectId: 'p-budget' });
  });
  it('navigates threads with arrow keys and Enter', async () => {
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog: () => ({ entries }) } });
    open();
    await slot.findByRole('option', { name: /Running task/ });
    const input = slot.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(slot.inspection.navigateCalls).toContainEqual({ method: 'toThread', threadId: 't-running' });
  });
  it('captures the shortcut before host bubble listeners, restores focus, and cleans up', async () => {
    const button = document.createElement('button'); document.body.append(button); button.focus();
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog: () => ({ entries }) } });
    const host = vi.fn(); window.addEventListener('keydown', host);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    await slot.findByRole('combobox'); expect(host).not.toHaveBeenCalled();
    fireEvent.keyDown(slot.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(slot.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
    slot.lifecycle.unmount();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(host).toHaveBeenCalled();
    window.removeEventListener('keydown', host); button.remove();
  });
  it('applies the current query when a pending catalog arrives, without another request', async () => {
    let resolveCatalog!: (value: unknown) => void;
    const catalog = vi.fn().mockImplementation(() => new Promise(resolve => { resolveCatalog = resolve; }));
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog } });
    open(); await waitFor(() => expect(catalog).toHaveBeenCalledTimes(1));
    fireEvent.change(slot.getByRole('combobox'), { target: { value: 'running' } });
    await act(async () => { resolveCatalog({ entries }); });
    expect(slot.queryAllByRole('option')).toHaveLength(1);
    expect(slot.getByRole('option', { name: /Running task/ })).toBeTruthy();
    expect(catalog).toHaveBeenCalledTimes(1);
  });

});

describe('initial search loading', () => {
  it('preloads before opening and immediately reuses results while refreshing', async () => {
    const search = vi.fn().mockResolvedValueOnce({ entries }).mockImplementation(() => new Promise(() => {}));
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog: search } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(slot.queryByRole('dialog')).toBeNull();
    open();
    expect(slot.getAllByRole('option')).toHaveLength(2);
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(slot.getByRole('combobox'), { key: 'Escape' });
    await waitFor(() => expect(slot.queryByRole('dialog')).toBeNull());
    open();
    expect(slot.getAllByRole('option')).toHaveLength(2);
    expect(search).toHaveBeenCalledTimes(2);
  });
  it('retries a failed preload on open', async () => {
    const search = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ entries });
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog: search } });
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await act(async () => {});
    open();
    await slot.findByRole('option', { name: /Budget New thread/ });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe('cold startup', () => {
  it('shows cached host projects before the first network response', () => {
    const slot = renderSlot(app.appOverlays[0]!, {}, {
      rpc: { catalog: () => new Promise(() => {}) },
      sidebarThreads: { status: 'ready', projects: [{ id: 'p-local', name: 'Local project', isPersonal: false }] },
    });
    open();
    expect(slot.getByRole('option', { name: /Local project New thread/ })).toBeTruthy();
    fireEvent.keyDown(slot.getByRole('combobox'), { key: 'Enter' });
    expect(slot.inspection.navigateCalls).toContainEqual({ method: 'toProject', projectId: 'p-local' });
  });
});


describe('local filtering', () => {
  it('filters immediately with no requests per keystroke, including items outside the initial top 20', async () => {
    const manyEntries = Array.from({ length: 30 }, (_, i) => ({
      group: 'Inactive threads', item: { id: `t-${i}`, kind: 'thread', title: `Task ${i}`, detail: 'Project' }, recency: i, extra: `branch-${i}`,
    }));
    const catalog = vi.fn().mockResolvedValue({ entries: manyEntries });
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog } });
    open();
    await slot.findAllByRole('option');
    const requests = catalog.mock.calls.length;
    expect(slot.getAllByRole('option')).toHaveLength(20);
    expect(slot.queryByRole('option', { name: 'Task 0 Project' })).toBeNull();
    fireEvent.change(slot.getByRole('combobox'), { target: { value: 'branch-0' } });
    expect(slot.getAllByRole('option')).toHaveLength(1);
    expect(slot.getByRole('option', { name: 'Task 0 Project' })).toBeTruthy();
    fireEvent.change(slot.getByRole('combobox'), { target: { value: 'no-match' } });
    expect(slot.queryAllByRole('option')).toHaveLength(0);
    fireEvent.change(slot.getByRole('combobox'), { target: { value: '' } });
    expect(slot.getAllByRole('option')).toHaveLength(20);
    expect(catalog).toHaveBeenCalledTimes(requests);
  });

  it('keeps local search usable when a background refresh fails and retries', async () => {
    const catalog = vi.fn().mockResolvedValueOnce({ entries }).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ entries });
    const slot = renderSlot(app.appOverlays[0]!, {}, { rpc: { catalog } });
    await waitFor(() => expect(catalog).toHaveBeenCalledTimes(1));
    await act(async () => {});
    open();
    await slot.findByRole('alert');
    fireEvent.change(slot.getByRole('combobox'), { target: { value: 'running' } });
    expect(slot.getByRole('option', { name: /Running task/ })).toBeTruthy();
    fireEvent.click(slot.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(slot.queryByRole('alert')).toBeNull());
    expect(slot.getAllByRole('option')).toHaveLength(1);
  });
});

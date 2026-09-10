// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';

let app: Awaited<ReturnType<typeof loadPluginApp>>;
beforeAll(async () => { app = await loadPluginApp(() => import('./app')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const run = { databaseId: 1, number: 1, displayTitle: 'Build the app', workflowName: 'CI', status: 'completed', conclusion: 'success', headBranch: 'feature/test', headSha: 'abc1234', event: 'push', url: 'https://github.com/acme/repo/actions/runs/1', createdAt: '2026-09-10T20:00:00Z', updatedAt: '2026-09-10T20:01:00Z' };
const data = { kind: 'ready', repository: 'acme/repo', url: 'https://github.com/acme/repo', branch: 'feature/test', commit: 'abc1234', scope: 'repository', fetchedAt: '2026-09-10T20:02:00Z', runs: [run, { ...run, databaseId: 2, workflowName: 'Deploy', displayTitle: 'Ship the app', status: 'in_progress', conclusion: '' }] };
const props = { threadId: 'thread-one', params: null };

describe('GitHub Actions panel', () => {
  it('renders run status and links, filters workflows locally and queries the current branch', async () => {
    const list = vi.fn().mockResolvedValue(data);
    const slot = renderSlot(app.threadPanelActions[0]!, props, { rpc: { list } });
    expect((await slot.findByRole('link', { name: 'Build the app' })).getAttribute('href')).toBe(run.url);
    expect(slot.getByText('Passed')).toBeTruthy();
    expect(slot.getByText('Running')).toBeTruthy();
    fireEvent.change(slot.getByRole('combobox', { name: 'Workflow' }), { target: { value: 'Deploy' } });
    expect(slot.queryByText('Build the app')).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
    fireEvent.click(slot.getByRole('button', { name: 'Current branch' }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(slot.inspection.rpcCalls.at(-1)?.input).toEqual({ threadId: 'thread-one', scope: 'branch' });
  });
  it('keeps the last successful runs when refresh fails', async () => {
    const list = vi.fn().mockResolvedValueOnce(data).mockResolvedValue({ kind: 'unavailable', message: 'Sign in with gh auth login on the thread’s host, then refresh.' });
    const slot = renderSlot(app.threadPanelActions[0]!, props, { rpc: { list } });
    await slot.findByText('Build the app');
    fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
    await slot.findByRole('alert');
    expect(slot.getByText('Build the app')).toBeTruthy();
    expect(slot.getByText('Showing the last successful refresh.')).toBeTruthy();
  });
  it('ignores stale requests after changing scope', async () => {
    let resolveOld!: (value: unknown) => void;
    const list = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ ...data, runs: [] });
    const slot = renderSlot(app.threadPanelActions[0]!, props, { rpc: { list } });
    fireEvent.click(slot.getByRole('button', { name: 'Current branch' }));
    await slot.findByText('No workflow runs yet');
    await act(async () => { resolveOld(data); });
    expect(slot.queryByText('Build the app')).toBeNull();
    expect(slot.getByText('No workflow runs yet')).toBeTruthy();
  });
  it('recovers from an initial transport error with Refresh', async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...data, runs: [] });
    const slot = renderSlot(app.threadPanelActions[0]!, props, { rpc: { list } });
    await slot.findByRole('alert');
    fireEvent.click(slot.getByRole('button', { name: 'Refresh' }));
    await slot.findByText('No workflow runs yet');
    expect(slot.queryByRole('alert')).toBeNull();
  });
  it('polls every 30 seconds, pauses while hidden, and stops after unmount', async () => {
    vi.useFakeTimers();
    const list = vi.fn().mockResolvedValue(data);
    const slot = renderSlot(app.threadPanelActions[0]!, props, { rpc: { list } });
    await act(async () => {});
    expect(list).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(list).toHaveBeenCalledTimes(2);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(list).toHaveBeenCalledTimes(2);
    hidden.mockRestore();
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(list).toHaveBeenCalledTimes(3);
    slot.lifecycle.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(list).toHaveBeenCalledTimes(3);
  });
});

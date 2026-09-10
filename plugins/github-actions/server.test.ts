import { afterEach, describe, expect, it } from 'vitest';
import { createFakePluginHost, makeThreadResponse, experimental_scanPublicSdkOnly } from '@get-bb/plugin-sdk/testing';
import plugin from './server';

const ready = { kind: 'ready', repository: 'acme/repo', url: 'https://github.com/acme/repo', branch: 'main', commit: 'abc1234', scope: 'repository', runs: [], fetchedAt: '2026-09-10T20:00:00Z' };
const hosts: ReturnType<typeof createFakePluginHost>[] = [];
afterEach(async () => { await Promise.all(hosts.splice(0).map(host => host.harness.lifecycle.dispose())); });
function setup(environmentId: string | null = 'env-remote') {
  const host = createFakePluginHost({
    pluginId: 'github-actions',
    sdk: {
      threads: { get: async ({ threadId }) => makeThreadResponse({ id: threadId, environmentId }) },
      environments: { get: async () => ({ id: 'env-remote', hostId: 'host-remote', projectId: 'proj-test', path: '/remote/checkout', status: 'ready', branchName: 'main', baseBranch: null, defaultBranch: 'main', mergeBaseBranch: null, createdAt: 0, updatedAt: 0, isGitRepo: true, isWorktree: true, managed: true, name: null, workspaceProvisionType: 'managed-worktree' }) },
    },
    experimental_callHostRpc: async ({ input }) => ({ ...ready, scope: (input as { scope: string }).scope }),
  });
  hosts.push(host);
  plugin(host.bb);
  return host.harness;
}
describe('server boundaries', () => {
  it('resolves host and path from the requested thread', async () => {
    const harness = setup();
    expect(await harness.behavior.callRpc('list', { threadId: 'thread-one', scope: 'branch' })).toMatchObject({ kind: 'ready', scope: 'branch' });
    expect(harness.experimental_hostRpcCalls).toEqual([expect.objectContaining({ hostId: 'host-remote', method: 'list', input: { cwd: '/remote/checkout', scope: 'branch' } })]);
  });
  it('rejects client-supplied paths', async () => {
    const harness = setup();
    await expect(harness.behavior.callRpc('list', { threadId: 'thread-one', scope: 'repository', cwd: '/somewhere/else' })).rejects.toThrow();
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
  it('handles threads without environments', async () => {
    const harness = setup(null);
    expect(await harness.behavior.callRpc('list', { threadId: 'new-thread', scope: 'repository' })).toMatchObject({ kind: 'unavailable' });
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  });
  it('exposes a bounded read-only CLI and validates arguments', async () => {
    const harness = setup();
    const result = await harness.behavior.runCli(['list', '--thread', 'thread-one', '--branch']);
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ scope: 'branch' });
    expect((await harness.behavior.runCli(['list', '--thread'])).exitCode).toBe(1);
    expect((await harness.behavior.runCli(['list', '--invalid'])).exitCode).toBe(1);
  });
  it('imports only public SDK surfaces', async () => {
    const result = await experimental_scanPublicSdkOnly(import.meta.dirname, { allow: [/^react$/, /^@radix-ui\/react-slot$/, /^@hugeicons\/(react|core-free-icons)$/, /^(class-variance-authority|clsx|tailwind-merge|vitest)$/, /^@testing-library\/react$/] });
    expect(result.violations).toEqual([]);
    expect(result.privateDependencies).toEqual([]);
  });
});

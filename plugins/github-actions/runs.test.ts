import { describe, expect, it, vi } from 'vitest';
import { loadRuns, type Command } from './runs';

export const sampleRun = {
  databaseId: 12, number: 3, displayTitle: 'Test the build', workflowName: 'CI',
  status: 'completed', conclusion: 'success', headBranch: 'feature/test', headSha: 'abc1234',
  event: 'push', url: 'https://github.com/acme/repo/actions/runs/12',
  createdAt: '2026-09-10T20:00:00Z', updatedAt: '2026-09-10T20:02:00Z',
};
function fake(options: { branch?: string; runs?: unknown; origin?: string | null; commit?: string | null; ghError?: unknown } = {}) {
  return vi.fn<Command>(async (file, args) => {
    if (file === 'gh' && options.ghError) throw options.ghError;
    if (args[0] === 'branch') return options.branch ?? 'feature/test';
    if (args[0] === 'remote') {
      if (options.origin === null) throw new Error('No origin');
      return options.origin ?? 'git@github.com:acme/repo.git';
    }
    if (args[0] === 'rev-parse') {
      if (args.includes('HEAD') && options.commit === null) throw new Error('Unborn branch');
      return args.includes('HEAD') ? (options.commit ?? 'abc1234') : '/checkout';
    }
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: 'acme/repo', url: 'https://github.com/acme/repo' });
    return JSON.stringify(options.runs ?? [sampleRun]);
  });
}
const signal = new AbortController().signal;

describe('GitHub Actions on the thread host', () => {
  it('uses the checkout origin and bounded explicit repository query', async () => {
    const run = fake();
    const result = await loadRuns('/checkout', 'repository', signal, run);
    expect(result).toMatchObject({ kind: 'ready', repository: 'acme/repo', runs: [sampleRun] });
    expect(run).toHaveBeenCalledWith('gh', ['repo', 'view', 'git@github.com:acme/repo.git', '--json', 'nameWithOwner,url'], '/checkout', signal);
    const args = run.mock.calls.at(-1)![1];
    expect(args).toEqual(expect.arrayContaining(['--repo', 'github.com/acme/repo', '--limit', '50']));
    expect(args).not.toContain('--branch');
  });
  it('passes special branch characters as one argument, without shell interpolation', async () => {
    const branch = 'feature/$(touch injected)';
    const run = fake({ branch });
    await loadRuns('/checkout with spaces', 'branch', signal, run);
    expect(run.mock.calls.at(-1)![1].slice(-2)).toEqual(['--branch', branch]);
  });
  it('filters a detached checkout by commit', async () => {
    const run = fake({ branch: '' });
    const result = await loadRuns('/checkout', 'branch', signal, run);
    expect(result).toMatchObject({ kind: 'ready', branch: null, commit: 'abc1234' });
    expect(run.mock.calls.at(-1)![1].slice(-2)).toEqual(['--commit', 'abc1234']);
  });
  it('uses gh default remote when origin is missing', async () => {
    const run = fake({ origin: null, runs: [] });
    expect(await loadRuns('/checkout', 'repository', signal, run)).toMatchObject({ kind: 'ready', runs: [] });
    expect(run).toHaveBeenCalledWith('gh', ['repo', 'view', '--json', 'nameWithOwner,url'], '/checkout', signal);
  });
  it('supports unborn branches and sorts by newest creation', async () => {
    const run = fake({ commit: null, runs: [{ ...sampleRun, databaseId: 11, createdAt: '2026-09-09T20:00:00Z' }, sampleRun] });
    const result = await loadRuns('/checkout', 'repository', signal, run);
    expect(result).toMatchObject({ kind: 'ready', commit: null });
    if (result.kind === 'ready') expect(result.runs.map(item => item.databaseId)).toEqual([12, 11]);
  });
  it.each([
    [{ code: 'ENOENT' }, 'Install GitHub CLI'],
    [{ stderr: 'HTTP 401: bad credentials secret-token' }, 'gh auth login'],
    [{ stderr: 'API rate limit exceeded' }, 'rate limit'],
    [{ name: 'AbortError' }, 'cancelled'],
  ])('returns actionable errors without raw process output', async (ghError, message) => {
    const result = await loadRuns('/checkout', 'repository', signal, fake({ ghError }));
    expect(result).toMatchObject({ kind: 'unavailable', message: expect.stringContaining(message) });
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });
  it.each(['javascript:alert(1)', 'https://evil.test/actions/runs/12', 'https://github.com/other/repo/actions/runs/12'])('rejects an invalid run URL: %s', async url => {
    expect(await loadRuns('/checkout', 'repository', signal, fake({ runs: [{ ...sampleRun, url }] }))).toMatchObject({ kind: 'unavailable' });
  });
  it('does not invoke gh outside a git checkout', async () => {
    const run = vi.fn<Command>().mockRejectedValue(new Error('not a repository'));
    expect(await loadRuns('/checkout', 'repository', signal, run)).toMatchObject({ kind: 'unavailable', message: expect.stringContaining('Git repository') });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

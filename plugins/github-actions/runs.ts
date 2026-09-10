import { execFile } from 'node:child_process';
import { z } from 'zod';
import { runSchema, type RunsResult, type Scope } from './contract';

export type Command = (file: 'git' | 'gh', args: string[], cwd: string, signal: AbortSignal) => Promise<string>;

// The thread checkout is authoritative, including on a remote host.
export const command: Command = (file, args, cwd, signal) => new Promise((resolve, reject) => {
  const env: NodeJS.ProcessEnv = { ...process.env, GH_PROMPT_DISABLED: '1', GH_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0' };
  for (const key of ['GH_REPO', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[key];
  execFile(file, args, { cwd, env, signal, timeout: 12000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8' },
    (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr }));
      else resolve(stdout.trim());
    });
});

const repoSchema = z.object({ nameWithOwner: z.string().min(1), url: z.url() });
const fields = 'databaseId,number,displayTitle,workflowName,status,conclusion,headBranch,headSha,event,url,createdAt,updatedAt';

function failure(error: unknown, tool: 'git' | 'gh'): RunsResult {
  const cause = error as { code?: string; stderr?: string; killed?: boolean; name?: string };
  let message: string;
  if (cause.code === 'ENOENT') message = `Install ${tool === 'gh' ? 'GitHub CLI (gh)' : 'Git'} on the thread’s host, then refresh.`;
  else if (cause.name === 'AbortError' || cause.killed) message = 'The Actions request timed out or was cancelled. Check the thread’s host connection, then refresh.';
  else if (tool === 'git') message = 'This checkout is not an accessible Git repository. Check the thread’s environment, then refresh.';
  else if (/auth login|not logged|authentication|HTTP 401|bad credentials/i.test(cause.stderr ?? '')) message = 'Sign in with gh auth login on the thread’s host, then refresh.';
  else if (/rate limit/i.test(cause.stderr ?? '')) message = 'GitHub’s API rate limit was reached. Wait a few minutes, then refresh.';
  else message = 'Could not read GitHub Actions. Check the checkout’s GitHub remote, gh login and repository access on the thread’s host, then refresh.';
  // Raw process errors can contain credentials from a remote URL.
  return { kind: 'unavailable', message };
}

export async function loadRuns(cwd: string, scope: Scope, signal: AbortSignal, run: Command = command): Promise<RunsResult> {
  let branch: string | null;
  let commit: string | null;
  try {
    await run('git', ['rev-parse', '--show-toplevel'], cwd, signal);
    branch = (await run('git', ['branch', '--show-current'], cwd, signal)) || null;
    try { commit = await run('git', ['rev-parse', '--verify', 'HEAD'], cwd, signal); }
    catch (error) { if (signal.aborted) throw error; commit = null; }
  } catch (error) { return failure(error, 'git'); }

  try {
    // Prefer origin, especially in forks. Without origin, use gh's default remote.
    let origin: string | null = null;
    try { origin = await run('git', ['remote', 'get-url', 'origin'], cwd, signal); }
    catch (error) { if (signal.aborted) throw error; }
    const repo = repoSchema.parse(JSON.parse(await run('gh', ['repo', 'view', ...(origin ? [origin] : []), '--json', 'nameWithOwner,url'], cwd, signal)));
    const url = new URL(repo.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid repository URL');
    const args = ['run', 'list', '--repo', `${url.host}/${repo.nameWithOwner}`, '--limit', '50', '--json', fields];
    if (scope === 'branch') {
      if (branch) args.push('--branch', branch);
      else if (commit) args.push('--commit', commit);
      else return { kind: 'unavailable', message: 'This checkout has no branch or commit to filter by. Choose All branches to see repository runs.' };
    }
    const runs = z.array(runSchema).max(50).parse(JSON.parse(await run('gh', args, cwd, signal)));
    if (runs.some(item => {
      const runUrl = new URL(item.url);
      return runUrl.origin !== url.origin || !runUrl.pathname.startsWith(`${url.pathname.replace(/\/$/, '')}/actions/runs/`) || Boolean(runUrl.username || runUrl.password);
    })) throw new Error('Invalid run URL');
    runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.databaseId - a.databaseId);
    return { kind: 'ready', repository: repo.nameWithOwner, url: repo.url, branch, commit, scope, runs, fetchedAt: new Date().toISOString() };
  } catch (error) { return failure(error, 'gh'); }
}

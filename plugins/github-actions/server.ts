import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { hostContract, rpcContract, type RunsResult, type Scope } from './contract';

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const lifetime = new AbortController();
  bb.onDispose(() => lifetime.abort());
  const list = async ({ threadId, scope }: { threadId: string; scope: Scope }): Promise<RunsResult> => {
    const thread = await bb.sdk.threads.get({ threadId });
    if (!thread.environmentId) return { kind: 'unavailable', message: 'This thread has no checkout yet. Open GitHub Actions again once its environment is ready.' };
    const environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    if (environment.status !== 'ready' || !environment.path) return { kind: 'unavailable', message: 'The thread’s checkout is not ready. Wait for its environment to become available, then refresh.' };
    return host.call('list', { cwd: environment.path, scope }, { hostId: environment.hostId, signal: lifetime.signal });
  };
  bb.rpc.register(rpcContract, { list });
  bb.cli.register({
    name: 'github-actions', summary: 'List GitHub Actions runs for a thread’s repository.',
    commands: [{ name: 'list', summary: 'List the latest 50 workflow runs as JSON.', usage: 'bb github-actions list [--thread <id>] [--branch]' }],
    async run(argv, context) {
      let threadId = context.threadId;
      let scope: Scope = 'repository';
      const args = [...argv];
      if (args[0] === 'list') args.shift();
      while (args.length) {
        const arg = args.shift();
        if (arg === '--branch') scope = 'branch';
        else if (arg === '--thread' && args[0] && !args[0].startsWith('--')) threadId = args.shift();
        else return { exitCode: 1, stderr: 'Usage: bb github-actions list [--thread <id>] [--branch]\n' };
      }
      if (!threadId) return { exitCode: 1, stderr: 'Run from a bb thread or pass --thread <id>.\n' };
      const result = await list({ threadId, scope });
      return { exitCode: result.kind === 'ready' ? 0 : 1, stdout: `${JSON.stringify(result, null, 2)}\n` };
    },
  });
}

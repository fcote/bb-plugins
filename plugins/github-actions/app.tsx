import { useEffect, useState } from 'react';
import { definePluginApp, UrlLink, useBbNavigate, useRpc, type PluginThreadPanelProps } from '@get-bb/plugin-sdk/app';
import type { rpcContract, RunsResult, Run, Scope } from './contract';
import { Button } from './components/ui/button';
import { Icon, type IconName } from './components/ui/icon';
import './app.css';

type Snapshot = Extract<RunsResult, { kind: 'ready' }>;

export function runStatus(run: Pick<Run, 'status' | 'conclusion'>): { label: string; icon: IconName; tone: string } {
  if (run.status !== 'completed') {
    if (run.status === 'in_progress') return { label: 'Running', icon: 'Loading', tone: 'text-primary' };
    return { label: run.status.replaceAll('_', ' '), icon: 'Circle', tone: 'text-muted-foreground' };
  }
  if (run.conclusion === 'success') return { label: 'Passed', icon: 'CircleCheck', tone: 'text-foreground' };
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(run.conclusion ?? '')) {
    return { label: run.conclusion === 'failure' ? 'Failed' : run.conclusion!.replaceAll('_', ' '), icon: 'CircleX', tone: 'text-destructive' };
  }
  return { label: (run.conclusion || 'completed').replaceAll('_', ' '), icon: 'Circle', tone: 'text-muted-foreground' };
}

function RunRow({ run }: { run: Run }) {
  const status = runStatus(run);
  return <li className="gha-run border-b border-border">
    <div className={`gha-status ${status.tone}`}>
      <Icon name={status.icon} className={run.status === 'in_progress' ? 'gha-spinning' : ''} />
      <span>{status.label}</span>
    </div>
    <UrlLink href={run.url} className="gha-run-title font-medium text-foreground hover:underline">
      {run.displayTitle || run.workflowName || `Run #${run.number}`}
    </UrlLink>
    <div className="gha-meta text-muted-foreground">
      <span>{run.workflowName || 'Workflow'} #{run.number}</span>
      <span>{run.event.replaceAll('_', ' ')}</span>
    </div>
    <div className="gha-meta text-muted-foreground">
      <span className="gha-branch">{run.headBranch || 'Detached commit'}</span>
      <code>{run.headSha.slice(0, 7)}</code>
      <time dateTime={run.createdAt} title={new Date(run.createdAt).toLocaleString()}>
        {new Date(run.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </time>
    </div>
  </li>;
}

export function RunsPanel({ threadId }: { threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [scope, setScope] = useState<Scope>('repository');
  const [snapshot, setSnapshot] = useState<{ scope: Scope; data: Snapshot } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [workflow, setWorkflow] = useState('');
  const data = snapshot?.scope === scope ? snapshot.data : null;

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setError(null);
    const update = async () => {
      if (pending || disposed) return;
      clearTimeout(timer);
      if (document.hidden) { setBusy(false); return; }
      pending = true;
      setBusy(true);
      try {
        const result = await rpc.call('list', { threadId, scope });
        if (disposed) return;
        if (result.kind === 'ready') { setSnapshot({ scope, data: result }); setError(null); }
        else setError(result.message);
      } catch {
        if (!disposed) setError('Could not reach the thread’s host. Check its connection, then refresh.');
      } finally {
        pending = false;
        if (!disposed) {
          setBusy(false);
          timer = setTimeout(() => { void update(); }, 30000);
        }
      }
    };
    void update();
    const visible = () => { if (!document.hidden) void update(); };
    document.addEventListener('visibilitychange', visible);
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [rpc, threadId, scope, refresh]);

  const workflows = [...new Set(data?.runs.map(run => run.workflowName).filter(Boolean) ?? [])].sort();
  const selectedWorkflow = workflows.includes(workflow) ? workflow : '';
  const runs = data?.runs.filter(run => !selectedWorkflow || run.workflowName === selectedWorkflow) ?? [];
  return <section className="gha-panel text-foreground" aria-label="GitHub Actions runs">
    <div className="gha-toolbar border-b border-border">
      <div className="gha-repository">
        {data ? <UrlLink href={`${data.url}/actions`} className="font-medium hover:underline">{data.repository}</UrlLink>
          : <span className="font-medium">Workflow runs</span>}
        {data && <p className="text-muted-foreground">{data.branch || (data.commit ? `Detached at ${data.commit.slice(0, 7)}` : 'No commits yet')}</p>}
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => setRefresh(value => value + 1)}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>
    <div className="gha-filters border-b border-border">
      <div className="gha-scope" role="group" aria-label="Run scope">
        <Button variant="ghost" size="sm" aria-pressed={scope === 'repository'} onClick={() => { setScope('repository'); setWorkflow(''); }}>All branches</Button>
        <Button variant="ghost" size="sm" aria-pressed={scope === 'branch'} onClick={() => { setScope('branch'); setWorkflow(''); }}>
          {data && !data.branch && data.commit ? 'Current commit' : 'Current branch'}
        </Button>
      </div>
      {workflows.length > 1 && <label className="gha-workflow text-muted-foreground">
        Workflow
        <select className="border border-input bg-background text-foreground" value={selectedWorkflow} onChange={event => setWorkflow(event.target.value)}>
          <option value="">All workflows</option>
          {workflows.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>}
    </div>
    {error && <div className="gha-notice border-b border-border" role="alert">
      <p className="font-medium">{data ? 'Could not refresh runs' : 'GitHub Actions unavailable'}</p>
      <p className="text-muted-foreground">{error}</p>
      {data && <p className="text-muted-foreground">Showing the last successful refresh.</p>}
    </div>}
    <div className="gha-results" aria-busy={busy}>
      {!data && !error && <p className="gha-empty text-muted-foreground" role="status">Loading workflow runs…</p>}
      {data && runs.length === 0 && <div className="gha-empty">
        <Icon name="Workflow" className="text-muted-foreground" />
        <p className="font-medium">No workflow runs yet</p>
        <p className="text-muted-foreground">{scope === 'branch' ? 'No runs were found for this checkout. Try All branches or push a commit that triggers a workflow.' : 'Runs will appear here when GitHub Actions workflows are triggered in this repository.'}</p>
        <UrlLink href={`${data.url}/actions`} className="underline underline-offset-4">Open GitHub Actions</UrlLink>
      </div>}
      {runs.length > 0 && <ul aria-label="Workflow runs">{runs.map(run => <RunRow key={run.databaseId} run={run} />)}</ul>}
    </div>
    {data && <p className="gha-footer border-t border-border text-muted-foreground" role="status">
      {runs.length} {runs.length === 1 ? 'run' : 'runs'}{selectedWorkflow ? ' in latest 50' : ' · Latest 50 maximum'}
      <span>Updated {new Date(data.fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })} · Every 30s while visible</span>
    </p>}
  </section>;
}

function ThreadPanel({ threadId }: PluginThreadPanelProps) { return <RunsPanel key={threadId} threadId={threadId} />; }
function HeaderAction() {
  const navigate = useBbNavigate();
  return <Button variant="ghost" size="sm" className="h-7" aria-label="Open GitHub Actions" onClick={() => navigate.openThreadPanel({ actionId: 'runs' })}>
    <Icon name="Workflow" /> Actions
  </Button>;
}
export default definePluginApp(app => {
  app.slots.threadPanelAction({ id: 'runs', title: 'GitHub Actions', icon: 'Workflow', component: ThreadPanel, layout: 'flush' });
  app.slots.experimental_threadHeaderAction({ id: 'actions', title: 'GitHub Actions', component: HeaderAction });
});

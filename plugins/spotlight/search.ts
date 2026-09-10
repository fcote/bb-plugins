import type { BbPluginApi } from '@get-bb/plugin-sdk';

import type { SidebarContext } from './sidebar';

export const groupNames = ['Projects', 'Active threads', 'Inactive threads', 'Settled threads'] as const;
export type GroupName = typeof groupNames[number];
export type SearchItem = { id: string; kind: 'project' | 'thread'; title: string; detail: string };
export type SearchGroup = { name: GroupName; total: number; items: SearchItem[] };
export type Thread = Awaited<ReturnType<BbPluginApi['sdk']['threads']['list']>>[number];
type Project = { id: string; name: string };

export function threadGroup(thread: Thread, sidebar?: SidebarContext): GroupName {
  if (thread.archivedAt !== null) return 'Settled threads';
  const working = ['active', 'starting', 'stopping', 'provisioning', 'host-reconnecting'].includes(thread.runtime.displayStatus)
    || Object.values(thread.activity).some(count => count > 0);
  if (sidebar) {
    const row = sidebar.rows.get(thread.id);
    if (!working && !thread.hasPendingInteraction && row) {
      if (row.snoozedUntil !== null) {
        if (row.snoozedUntil > sidebar.now && (row.snoozedAt === null || thread.latestAttentionAt <= row.snoozedAt)) return 'Inactive threads';
      } else if (row.settledAt !== null && thread.latestAttentionAt <= row.settledAt) return 'Settled threads';
    }
    const lastActivity = Math.max(thread.createdAt, thread.updatedAt, thread.latestAttentionAt);
    if (thread.pinnedAt === null && sidebar.inactiveAfterHours !== null
      && lastActivity <= sidebar.now - sidebar.inactiveAfterHours * 3_600_000) return 'Inactive threads';
    return 'Active threads';
  }
  return working ? 'Active threads' : 'Inactive threads';
}

export type CatalogEntry = { group: GroupName; item: SearchItem; recency: number; extra: string };
export type SearchIndexEntry = CatalogEntry & { normalizedTitle: string; normalizedText: string };

function normalize(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export function buildCatalog(projects: readonly Project[], threads: readonly Thread[], sidebar?: SidebarContext): CatalogEntry[] {
  const projectNames = new Map(projects.map(project => [project.id, project.name]));
  const entries: CatalogEntry[] = projects.map(project => ({
    group: 'Projects', item: { id: project.id, kind: 'project', title: project.name, detail: 'New thread' }, recency: 0, extra: '',
  }));
  for (const thread of threads) {
    if (thread.visibility === 'hidden' || thread.deletedAt !== null) continue;
    entries.push({ group: threadGroup(thread, sidebar), item: {
      id: thread.id, kind: 'thread', title: thread.title || thread.titleFallback || 'Untitled thread',
      detail: projectNames.get(thread.projectId) || 'Unknown project',
    }, recency: thread.updatedAt, extra: thread.environmentBranchName || '' });
  }
  return entries;
}

// Normalize and sort once per snapshot, not once per keystroke.
export function prepareIndex(entries: readonly CatalogEntry[]): SearchIndexEntry[] {
  return entries.map(entry => ({ ...entry,
    normalizedTitle: normalize(entry.item.title),
    normalizedText: normalize(`${entry.item.title} ${entry.item.detail} ${entry.item.id} ${entry.extra}`),
  })).sort((a, b) => b.recency - a.recency || a.item.title.localeCompare(b.item.title) || a.item.id.localeCompare(b.item.id));
}

export function searchIndex(index: readonly SearchIndexEntry[], query: string): SearchGroup[] {
  const needle = normalize(query.trim());
  const words = needle.split(/\s+/).filter(Boolean);
  const groups = groupNames.map(name => ({ name, total: 0, items: [] as SearchItem[] }));
  // Buckets retain recency/name ordering without sorting the whole match set.
  const buckets: SearchIndexEntry[][] = [[], [], [], []];
  for (const entry of index) {
    if (!words.every(word => entry.normalizedText.includes(word))) continue;
    const score = needle && entry.normalizedTitle === needle ? 3 : needle && entry.normalizedTitle.startsWith(needle) ? 2 : needle && entry.normalizedTitle.includes(needle) ? 1 : 0;
    buckets[score]!.push(entry);
  }
  for (let score = 3; score >= 0; score--) {
    for (const entry of buckets[score]!) {
      const group = groups[groupNames.indexOf(entry.group)]!;
      group.total++;
      if (group.items.length < 20) group.items.push(entry.item);
    }
  }
  return groups;
}

export function searchCatalog(projects: readonly Project[], threads: readonly Thread[], query: string, sidebar?: SidebarContext): SearchGroup[] {
  return searchIndex(prepareIndex(buildCatalog(projects, threads, sidebar)), query);
}

export async function loadThreads(sdk: BbPluginApi['sdk'], archived: boolean): Promise<Thread[]> {
  const rows = new Map<string, Thread>();
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await sdk.threads.list({ archived, includeHidden: false, limit, offset });
    for (const thread of page) rows.set(thread.id, thread);
    if (page.length < limit) return [...rows.values()];
  }
}

import { describe, expect, it } from 'vitest';
import { makeThreadResponse } from '@get-bb/plugin-sdk/testing';
import { loadThreads, searchCatalog, threadGroup, type Thread } from './search';
import { isSpotlightShortcut } from './shortcut';
import type { BbPluginApi } from '@get-bb/plugin-sdk';

const thread = (overrides: Partial<Thread> = {}): Thread => ({
  ...makeThreadResponse(), environmentBranchName: null, environmentHostId: null,
  environmentName: null, environmentWorkspaceDisplayKind: 'other',
  latestAttentionAt: 0, titleFallback: null, hasPendingInteraction: false, pinSortKey: null, activity: { activeBackgroundAgentCount: 0, activeBackgroundCommandCount: 0, activeGoalCount: 0, activePlanModeCount: 0, activeWorkflowCount: 0 }, runtime: { displayStatus: 'idle', hostReconnectGraceExpiresAt: null }, queuedWork: 'none', ...overrides,
});

describe('Spotlight search', () => {
  it('separates running, inactive, and archived threads including background work', () => {
    const idle = thread({ status: 'idle', archivedAt: null });
    expect(threadGroup(idle)).toBe('Inactive threads');
    expect(threadGroup({ ...idle, status: 'active', runtime: { ...idle.runtime, displayStatus: 'active' } })).toBe('Active threads');
    expect(threadGroup({ ...idle, activity: { ...idle.activity, activeWorkflowCount: 1 } })).toBe('Active threads');
    expect(threadGroup({ ...idle, status: 'active', archivedAt: 123 })).toBe('Settled threads');
  });
  it('matches accents, multiple tokens, project names, IDs and branches, excluding hidden and deleted', () => {
    const rows = [thread({ id: 't1', projectId: 'p1', title: 'Café fixes', status: 'idle', archivedAt: null, deletedAt: null, visibility: 'visible', environmentBranchName: 'fix/search' })];
    const projects = [{ id: 'p1', name: 'Budget' }];
    expect(searchCatalog(projects, rows, 'cafe budget')[2]!.items[0]?.id).toBe('t1');
    expect(searchCatalog(projects, rows, 'fix/search')[2]!.total).toBe(1);
    expect(searchCatalog(projects, rows, 't1')[2]!.total).toBe(1);
    expect(searchCatalog(projects, [{ ...rows[0]!, visibility: 'hidden' }], '')[2]!.total).toBe(0);
    expect(searchCatalog(projects, [{ ...rows[0]!, deletedAt: 123 }], '')[2]!.total).toBe(0);
  });
  it('bounds each group independently and ranks exact project matches first', () => {
    const projects = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}` }));
    expect(searchCatalog(projects, [], '')[0]).toMatchObject({ total: 30, items: expect.any(Array) });
    expect(searchCatalog(projects, [], '')[0]!.items).toHaveLength(20);
    expect(searchCatalog(projects, [], 'Project 1')[0]!.items[0]!.id).toBe('p1');
  });
  it('pages beyond the first hundred threads', async () => {
    const calls: number[] = [];
    const sdk = { threads: { list: async ({ offset }: { offset: number }) => {
      calls.push(offset);
      return Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => thread({ id: `t${offset + i}` }));
    } } } as unknown as BbPluginApi['sdk'];
    expect(await loadThreads(sdk, true)).toHaveLength(101);
    expect(calls).toEqual([0, 100]);
  });
});

describe('platform shortcut', () => {
  const base = { key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, isComposing: false };
  it('uses Command only on macOS and Control otherwise', () => {
    expect(isSpotlightShortcut({ ...base, metaKey: true }, 'MacIntel')).toBe(true);
    expect(isSpotlightShortcut({ ...base, ctrlKey: true }, 'MacIntel')).toBe(false);
    expect(isSpotlightShortcut({ ...base, ctrlKey: true }, 'Win32')).toBe(true);
    expect(isSpotlightShortcut({ ...base, ctrlKey: true }, 'Linux x86_64')).toBe(true);
    expect(isSpotlightShortcut({ ...base, metaKey: true }, 'Linux x86_64')).toBe(false);
  });
  it('does not capture other chords or composition', () => {
    for (const extra of [{ shiftKey: true }, { altKey: true }, { isComposing: true }, { key: 'p' }]) {
      expect(isSpotlightShortcut({ ...base, ctrlKey: true, ...extra }, 'Linux')).toBe(false);
    }
  });
});

describe('BB Sidebar shelves', () => {
  const now = 100_000_000;
  const context = { now, inactiveAfterHours: 6, rows: new Map() };
  const idle = thread({ id: 't1', status: 'idle', archivedAt: null, createdAt: now, updatedAt: now, latestAttentionAt: now, pinnedAt: null });
  it('keeps recently idle work active and uses the configured inactivity cutoff', () => {
    expect(threadGroup(idle, context)).toBe('Active threads');
    const old = { ...idle, createdAt: 1, updatedAt: 1, latestAttentionAt: 1 };
    expect(threadGroup(old, context)).toBe('Inactive threads');
    expect(threadGroup({ ...old, pinnedAt: 1 }, context)).toBe('Active threads');
    expect(threadGroup(old, { ...context, inactiveAfterHours: null })).toBe('Active threads');
  });
  it('respects settled state but wakes for newer attention or running work', () => {
    const settled = { ...context, rows: new Map([['t1', { threadId: 't1', settledAt: now, snoozedAt: null, snoozedUntil: null }]]) };
    expect(threadGroup(idle, settled)).toBe('Settled threads');
    expect(threadGroup({ ...idle, latestAttentionAt: now + 1 }, settled)).toBe('Active threads');
    expect(threadGroup({ ...idle, runtime: { ...idle.runtime, displayStatus: 'active' } }, settled)).toBe('Active threads');
    expect(threadGroup({ ...idle, hasPendingInteraction: true }, settled)).toBe('Active threads');
  });
});

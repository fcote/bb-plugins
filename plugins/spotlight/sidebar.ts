import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';

const lifecycleSchema = z.object({ rows: z.array(z.object({
  threadId: z.string(), settledAt: z.number().nullable(),
  snoozedUntil: z.number().nullable(), snoozedAt: z.number().nullable(),
})) });
const settingsSchema = z.object({ inactiveThreadsEnabled: z.boolean(), inactiveAfterHours: z.number().int().min(1).max(720) });
export type SidebarContext = {
  inactiveAfterHours: number | null;
  rows: Map<string, z.infer<typeof lifecycleSchema>['rows'][number]>;
  now: number;
};

/** Optional integration through BB Sidebar's schema-validated public RPCs. */
export async function readSidebarContext(sdk: BbPluginApi['sdk']): Promise<SidebarContext | undefined> {
  try {
    const [lifecycle, settings] = await Promise.all([
      sdk.plugins.callRpc({ pluginId: 'bb-sidebar', method: 'listLifecycle', input: {}, outputSchema: lifecycleSchema }),
      sdk.plugins.callRpc({ pluginId: 'bb-sidebar', method: 'getSidebarSettings', input: {}, outputSchema: settingsSchema }),
    ]);
    return { rows: new Map(lifecycle.rows.map(row => [row.threadId, row])),
      inactiveAfterHours: settings.inactiveThreadsEnabled ? settings.inactiveAfterHours : null, now: Date.now() };
  } catch {
    // A standalone installation has no BB Sidebar dependency.
    return undefined;
  }
}

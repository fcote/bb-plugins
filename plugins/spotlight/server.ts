import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { readSidebarContext } from './sidebar';
import { buildCatalog, groupNames, loadThreads, prepareIndex, searchIndex } from './search';

const itemSchema = z.object({ id: z.string(), kind: z.enum(['project', 'thread']), title: z.string(), detail: z.string() });
export const rpcContract = defineRpcContract({
  catalog: {
    input: z.null(),
    output: z.object({ entries: z.array(z.object({
      group: z.enum(groupNames), item: itemSchema, recency: z.number(), extra: z.string(),
    })) }),
  },
  search: {
    input: z.object({ query: z.string().max(200) }),
    output: z.object({ groups: z.array(z.object({
      name: z.enum(groupNames), total: z.number().int().nonnegative(), items: z.array(itemSchema),
    })) }),
  },
});

export default function plugin(bb: BbPluginApi) {
  const catalog = async () => {
    const [projects, current, archived, sidebar] = await Promise.all([
      bb.sdk.projects.list({ includePersonal: true }),
      loadThreads(bb.sdk, false), loadThreads(bb.sdk, true), readSidebarContext(bb.sdk),
    ]);
    return { entries: buildCatalog(projects, [...current, ...archived], sidebar) };
  };
  bb.rpc.register(rpcContract, {
    catalog,
    search: async ({ query }) => ({ groups: searchIndex(prepareIndex((await catalog()).entries), query) }),
  });
}

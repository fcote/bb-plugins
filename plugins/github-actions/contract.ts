import { defineRpcContract } from '@get-bb/plugin-sdk';
import { z } from 'zod';

const webUrl = z.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol));
export const runSchema = z.object({
  databaseId: z.number().int().positive(), number: z.number().int(),
  displayTitle: z.string(), workflowName: z.string(),
  status: z.string(), conclusion: z.string().nullable(),
  headBranch: z.string(), headSha: z.string(), event: z.string(),
  url: webUrl, createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
});
export const scopeSchema = z.enum(['repository', 'branch']);
export const resultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ready'), repository: z.string(), url: webUrl,
    branch: z.string().nullable(), commit: z.string().nullable(),
    scope: scopeSchema, runs: z.array(runSchema).max(50), fetchedAt: z.iso.datetime(),
  }),
  z.object({ kind: z.literal('unavailable'), message: z.string() }),
]);
export type Run = z.infer<typeof runSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type RunsResult = z.infer<typeof resultSchema>;
export const rpcContract = defineRpcContract({
  list: {
    input: z.object({ threadId: z.string().min(1).max(200), scope: scopeSchema }).strict(),
    output: resultSchema,
  },
});
export const hostContract = defineRpcContract({
  list: {
    input: z.object({ cwd: z.string().min(1).max(16384), scope: scopeSchema }).strict(),
    output: resultSchema,
  },
});

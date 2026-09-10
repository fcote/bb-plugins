import { experimental_defineHostEntry } from '@get-bb/plugin-sdk';
import { hostContract } from './contract';
import { loadRuns } from './runs';

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    list: ({ cwd, scope }, context) => loadRuns(cwd, scope,
      AbortSignal.any([context.signal, context.lifecycle.signal, AbortSignal.timeout(25000)])),
  },
});

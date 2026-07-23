// A scripted stand-in for the cloud provider (`build/09-edge/01-ai-router`),
// which has no staging deploy yet (BUILD-ORDER.md, 2026-07-22 log). This is
// **not** a capability measurement — the harness hands it the reference SQL
// for the exact question it's about to ask (one provider instance per
// question, mirroring how `runHarness` already calls `create()` per
// question), so its exec-rate is 100% by construction. Its only job is
// proving the harness's per-provider plumbing (turn accounting, cost proxy,
// repair-rate columns) is complete end-to-end before a real `servedBy:
// 'cloud'` backend exists. The D40 report must label this column "mock —
// framework check only," never a cloud quality number (D40's own honesty
// rule, mirrored from D43).
import type { AIProvider, ProviderMessage, ProviderTurn } from '../../src/types';

export function createMockCloudProvider(referenceSql: string): AIProvider {
  return {
    id: 'mock-cloud',
    async complete(messages: ProviderMessage[]): Promise<ProviderTurn> {
      const alreadyCalledTool = messages.some((m) => m.role === 'tool');
      if (alreadyCalledTool) {
        return { kind: 'text', text: 'Here is the result.' };
      }
      return { kind: 'tool_call', call: { id: crypto.randomUUID(), name: 'execute_local_sql', input: { sql: referenceSql } } };
    },
  };
}

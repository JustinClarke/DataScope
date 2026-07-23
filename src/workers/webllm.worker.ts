// The WebLLM engine host. The model loads and runs here, never on the main
// thread — model load measurably janks the main thread (frame gaps of ~500 ms),
// so the engine is Worker-mandatory. The handler speaks WebLLM's own message
// protocol; all lifecycle and state live client-side in services/webllm.ts.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};

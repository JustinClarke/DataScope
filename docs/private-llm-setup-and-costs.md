# Private LLM Setup & Cloud AI Cost Analysis

This document outlines the setup for local/private LLM hosting (via Ollama + Tailscale) as well as cost and privacy breakdowns for commercial zero-data-training AI APIs.

---

## 1. Local Network LLM Setup (Ollama + Tailscale)

If you have a separate machine (e.g., an Apple Silicon Mac with unified memory) acting as a local inference server, you can expose its LLM across your private mesh network without exposing it to the public internet.

### Host Machine Setup (e.g., M4 MacBook Air)

1. **Install Ollama**: Download from [ollama.com](https://ollama.com/).
2. **Configure Network Binding**:
   Add the following line to `~/.zshrc` so Ollama listens across network interfaces:
   ```bash
   export OLLAMA_HOST=0.0.0.0:11434
   ```
   Apply it and start the server:
   ```bash
   source ~/.zshrc
   ollama serve
   ```
3. **Pull a Model**:
   ```bash
   ollama run qwen2.5-coder:14b
   ```
   *(Quantized 14B model fitting inside ~9GB VRAM).*

4. **Connect via Tailscale**:
   Install [Tailscale](https://tailscale.com/) on both host and client machines. Note the host's static Tailscale IP (e.g. `100.126.157.97`).

---

### Client Application Configuration (DataScope)

In DataScope:
* **`.env.local`**:
  ```ini
  IP_ADDRESS=100.126.157.97
  ```
* **`edge/ai/byok.ts`**:
  ```typescript
  const OPENAI_CHAT_URL = 'http://100.126.157.97:11434/v1/chat/completions'
  const DEFAULT_OPENAI_MODEL = 'qwen2.5-coder:14b'
  ```
* **`Makefile`**:
  ```makefile
  OLLAMA_URL := http://100.126.157.97:11434
  OLLAMA_MODEL := qwen2.5-coder:14b
  ```
* **API Key**: Enter any dummy string (e.g., `ollama`) in the UI's BYOK key field. Ollama accepts all bearer tokens.

---

## 2. Private Cloud AI APIs (Zero Data Training)

For users who want zero-maintenance cloud AI without training data retention, the following options provide strict enterprise privacy guarantees.

### A. Cloudflare Workers AI (DataScope Default Edge Provider)
* **Privacy Terms**: Cloudflare does **not** retain, log, or train on customer data submitted to Workers AI models. Data is processed in-memory and discarded.
* **Pricing**:
  * **Free Tier**: 10,000 Neurons / day (~$0).
  * **Workers Paid ($5/mo)**: 10,000 free neurons daily + $0.011 per 1,000 Neurons thereafter.
* **DataScope Unit Cost**: Structure-only synthesis queries consume ~14–50 neurons per call. $5/month easily covers tens of thousands of requests.

### B. OpenAI API (`gpt-4o-mini` / `gpt-4o`)
* **Privacy Terms**: OpenAI's Commercial API terms explicitly state that **data submitted via the API is NOT used to train OpenAI models**. *(This applies to API keys, not consumer ChatGPT web chat).*
* **Pricing (`gpt-4o-mini`)**:
  * Input: $0.15 / 1 Million tokens
  * Output: $0.60 / 1 Million tokens
* **DataScope Unit Cost**: ~1,000 typical DataScope synthesis queries cost **~$0.10 to $0.15 total**.

### C. Anthropic API (`claude-3-5-haiku`)
* **Privacy Terms**: Anthropic commercial API inputs and outputs are **not used for model training**.
* **Pricing (`claude-3-5-haiku`)**:
  * Input: $0.80 / 1M tokens
  * Output: $4.00 / 1M tokens
* **DataScope Unit Cost**: ~1,000 synthesis queries cost **~$0.50 to $0.70 total**.

---

## 3. Dedicated Cloud GPU Hosting (Self-Hosted Cloud)

If you want a dedicated cloud server running open-source models (vLLM / Ollama):

| Hosting Provider | Hardware Specs | Hourly Cost | Monthly Cost (24/7) | On-Demand (Work Hours ~40h/wk) |
| :--- | :--- | :--- | :--- | :--- |
| **RunPod / Vast.ai** | RTX 4090 (24GB VRAM) | ~$0.30 – $0.44 / hr | ~$210 – $310 / mo | ~$50 / mo |
| **AWS (g5.xlarge)** | NVIDIA A10G (24GB VRAM) | ~$1.00 / hr | ~$730 / mo | ~$160 / mo |

---

## Summary Matrix

| Option | Data Privacy | Maintenance | Estimated Monthly Cost |
| :--- | :--- | :--- | :--- |
| **Local M4 + Tailscale** | 100% Private (No cloud egress) | Zero (Local Mac) | **$0** |
| **Cloudflare Workers AI** | Enterprise Non-Retention | Managed | **$0 – $5 / mo** |
| **OpenAI API (`gpt-4o-mini`)** | API Terms (No training) | Managed | **~$0.50 – $2.00 / mo** |
| **RunPod / Vast.ai** | Private Cloud VM | Self-managed | **~$5 – $50 / mo** (on-demand) |

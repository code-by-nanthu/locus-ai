# Local Model Hardware Recommendations (Q-5)

Choosing the right local model and quantization format depends on your available system RAM and GPU VRAM (or Apple Silicon Unified Memory). Running models that exceed your memory tier causes system swapping and degraded agent performance.

---

## Hardware Tiers & Recommended Models

### Tier 1: 8 GB Unified Memory / VRAM
*For laptops and entry-level machines. Best for fast code completions and lightweight queries.*

| Model | Parameters | Quantization | Engine | Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Qwen 2.5 Coder** | 3B | Q4_K_M / Q5_K_M | Ollama / LM Studio | Excellent coding syntax, fits comfortably in ~3.2 GB memory. |
| **Llama 3.2** | 3B | Q4_K_M | Ollama | Fast general conversational speed, ~2.8 GB memory. |

> [!NOTE]
> For 3B models, Locus dynamically gates tool schemas on simple greetings to prevent template hallucinations.

---

### Tier 2: 16 GB Unified Memory / VRAM
*The sweet spot for everyday local software engineering and autonomous tool execution.*

| Model | Parameters | Quantization | Engine | Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Qwen 2.5 Coder** | 7B | Q5_K_M / Q6_K | Ollama / vLLM | Top-tier multi-turn tool calling, refactoring, and code comprehension. |
| **DeepSeek Coder V2 Lite** | 16B (MoE) | Q4_K_M | Ollama / LM Studio | Mixture-of-Experts architecture: only 2.4B active params per token. |
| **Mistral 7B Instruct v0.3** | 7B | Q5_K_M | Ollama / llama.cpp | Stable function calling, strong instruction adherence. |

---

### Tier 3: 32 GB – 48 GB Unified Memory / VRAM
*For complex repository refactoring, large context windows, and autonomous task planning.*

| Model | Parameters | Quantization | Engine | Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Qwen 2.5 Coder** | 14B / 32B | Q4_K_M | Ollama / vLLM | Near frontier-level coding performance. Unrivaled for diff-based editing. |
| **Command R+ / Codestral** | 22B | Q4_K_M | Ollama / LM Studio | 32k+ context window support with native tool calling. |

---

### Tier 4: 64 GB+ Unified Memory / Multi-GPU
*For large-scale repository audits, massive context lengths, and enterprise autonomy.*

| Model | Parameters | Quantization | Engine | Strengths |
| :--- | :--- | :--- | :--- | :--- |
| **Qwen 2.5 Coder** | 32B | Q8_0 / FP16 | vLLM / Ollama | Maximum precision, zero hallucination on complex multi-file diffs. |
| **Llama 3.3** | 70B | Q4_K_M | Ollama / vLLM | Exceptional reasoning, complex logic decomposition. |

---

## Performance Optimization Tips

1. **Context Window Configuration:**  
   Configure context window to 16,384 or 32,768 in Ollama (`num_ctx: 32768`). Locus's built-in `compactHistory` will automatically manage turn compaction if limits are reached.
2. **GPU Offloading:**  
   In Ollama, ensure all layers are offloaded to GPU (`OLLAMA_NUM_PARALLEL=1` for dedicated single-task throughput).

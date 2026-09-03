# Locus Tool Reference & Provider Setup Guide (Q-3)

**Version:** 1.0.0  
**Scope:** Built-in Autonomous Agent Tools & Inference Engine Integrations

---

## Part 1: Built-in Tool Reference

Locus equips models with a safe, curated set of tools to interact with local codebases.

### 1. `read_file`
Reads the content of any file inside the workspace directory.
- **Parameters:**
  - `filePath` *(string, required)*: Workspace-relative path to the target file.
  - `startLine` *(number, optional)*: 1-indexed starting line number for line-range slicing.
  - `endLine` *(number, optional)*: 1-indexed ending line number.
- **Security:** Access to `.env*`, `.git/config`, `id_rsa`, `.npmrc`, `.aws/`, or `.ssh/` is unconditionally rejected. Path traversal (`../`) escaping the workspace is denied.

### 2. `edit_file`
Performs surgical search-and-replace modifications without rewriting entire files.
- **Parameters:**
  - `filePath` *(string, required)*: Relative file path.
  - `targetContent` *(string, required)*: Exact code snippet or lines to find and replace.
  - `replacementContent` *(string, required)*: Replacement code snippet.
  - `allowMultiple` *(boolean, optional)*: Replaces all occurrences if `true`. Defaults to `false` (requires unique occurrence to avoid accidental replacements).
- **Features:**
  - Automatic newline normalization (`\r\n` vs `\n`).
  - Automatic pre-modification snapshot creation in `.locus/snapshots/` (revertible via `/undo`).

### 3. `write_file`
Creates a new file or completely replaces an existing file.
- **Parameters:**
  - `filePath` *(string, required)*: Target file path.
  - `content` *(string, required)*: Complete content to write.
- **Features:** Automatically creates parent directories and creates a pre-edit snapshot if modifying an existing file.

### 4. `find_symbol`
Locates code symbols (functions, classes, interfaces, types, structs) across workspace source code.
- **Parameters:**
  - `query` *(string, required)*: Symbol name or substring to search for.
  - `kind` *(string, optional)*: Filter by symbol type (`"function" | "class" | "interface" | "type" | "variable"`).
- **Supported Languages:** TypeScript, JavaScript, Python, Go, Rust.

### 5. `run_command`
Executes bash/zsh shell commands on the local machine.
- **Parameters:**
  - `command` *(string, required)*: Shell command phrase to run.
  - `sandbox` *(string, optional)*: Set to `"docker"` to execute inside an isolated container.
- **Security:**
  - Scrubbed environment credentials (`AWS_SECRET_ACCESS_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`).
  - Strict 120-second timeout to prevent zombie processes.
  - Requires user approval unless matching an auto-approved whitelist pattern.

### 6. `search_workspace`
Recursively lists and searches workspace file paths.
- **Parameters:**
  - `query` *(string, optional)*: Keyword or glob pattern (e.g. `*.tsx`, `package.json`).
- **Features:** Respects `.gitignore`, excludes build/vendor directories (`node_modules`, `dist`, `.git`), and prioritizes exact filename matches.

### 7. `browser_action`
Playwright-driven browser automation for web verification.
- **Parameters:**
  - `action` *(string, required)*: `"navigate" | "click" | "type" | "screenshot" | "close"`.
  - `url`, `selector`, `text`: Target parameters depending on action.

---

## Part 2: Local Inference Engine Setup

Locus connects to any OpenAI-compatible local server.

### 1. Ollama (Default)
```bash
# Start server
ollama serve

# Recommended coding models
ollama run qwen2.5-coder:7b
ollama run llama3.2:3b
```
*Default URL:* `http://localhost:11434/v1`

### 2. LM Studio
1. Open LM Studio.
2. Download a model (e.g. `Qwen2.5-Coder-7B-Instruct-GGUF`).
3. Click the **Developer / Local Server** tab (`<->`).
4. Click **Start Server**.
*Default URL:* `http://localhost:1234/v1`

### 3. vLLM (High Throughput & GPU Inference)
```bash
python3 -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-Coder-7B-Instruct \
  --port 8000
```
*Default URL:* `http://localhost:8000/v1`

### 4. LocalAI
```bash
docker run -p 8080:8080 --name local-ai -ti localai/localai:latest-aio-cpu
```
*Default URL:* `http://localhost:8080/v1`

### 5. Jan
1. Open Jan Desktop.
2. Go to **Settings** -> **Local API Server**.
3. Toggle server **On** (Port 1337).
*Default URL:* `http://localhost:1337/v1`

### 6. GPT4All
1. Open GPT4All.
2. Go to **Settings** -> **Application** -> **Enable API Server** (Port 4891).
*Default URL:* `http://localhost:4891/v1`

### 7. llama.cpp (`llama-server`)
```bash
llama-server -m qwen2.5-coder-7b-instruct-q5_k_m.gguf --port 8080 -c 16384
```
*Default URL:* `http://localhost:8080/v1`

### 8. Oobabooga (Text Generation WebUI)
```bash
python server.py --api --api-port 5000 --listen
```
*Default URL:* `http://localhost:5000/v1`

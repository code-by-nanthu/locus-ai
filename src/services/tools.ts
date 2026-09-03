import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { glob } from 'glob';
import open from 'open';

export async function openInSystemBrowser(targetUrl: string): Promise<boolean> {
  try {
    await open(targetUrl);
    return true;
  } catch {
    try {
      if (process.platform === 'darwin') {
        await execa('open', [targetUrl]);
        return true;
      } else if (process.platform === 'win32') {
        await execa('cmd', ['/c', 'start', '', targetUrl]);
        return true;
      } else {
        await execa('xdg-open', [targetUrl]);
        return true;
      }
    } catch {
      return false;
    }
  }
}

async function launchChromiumBrowser(chromiumModule: any): Promise<any> {
  const channels = ['chrome', 'msedge', 'chromium'];
  for (const channel of channels) {
    try {
      return await chromiumModule.launch({ channel, headless: false });
    } catch {}
    try {
      return await chromiumModule.launch({ channel, headless: true });
    } catch {}
  }

  const knownPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  for (const exePath of knownPaths) {
    try {
      return await chromiumModule.launch({ executablePath: exePath, headless: false });
    } catch {}
    try {
      return await chromiumModule.launch({ executablePath: exePath, headless: true });
    } catch {}
  }

  try {
    return await chromiumModule.launch({ headless: false });
  } catch {}
  return await chromiumModule.launch({ headless: true });
}

// Global state for stateful browser sessions
let globalBrowser: any = null;
let globalContext: any = null;
let globalPage: any = null;

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'search_workspace',
      description: 'Recursively search and list the file/directory tree structure within the workspace project to find specific components or inspect paths.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional keyword or pattern filtering (e.g., "*.ts", "package.json")' }
        }
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_symbol',
      description: 'Search for symbol definitions (functions, classes, interfaces, types, structs) across workspace source code files.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The name or substring of the symbol to find (e.g. "runAgentLoop", "UserConfig")' },
          kind: { type: 'string', description: 'Optional filter: "function" | "class" | "interface" | "type"' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_file',
      description: 'Read the text content of a file within the workspace. Supports line slicing with startLine and endLine.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'The relative path to the file' },
          startLine: { type: 'number', description: 'Optional 1-indexed start line number' },
          endLine: { type: 'number', description: 'Optional 1-indexed end line number' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'write_file',
      description: 'Create a new file or completely overwrite an existing file with updated code or text.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'The relative path where the file should be saved' },
          content: { type: 'string', description: 'The full code or text contents to write' }
        },
        required: ['filePath', 'content']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'edit_file',
      description: 'Perform a surgical search-and-replace edit on a file without rewriting the entire file. Use this for making exact code modifications.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'The relative path to the file to edit' },
          targetContent: { type: 'string', description: 'The exact lines or snippet of existing code to find and replace' },
          replacementContent: { type: 'string', description: 'The new replacement code to insert in place of targetContent' },
          allowMultiple: { type: 'boolean', description: 'If true, replaces all occurrences; default is false (requires unique match)' }
        },
        required: ['filePath', 'targetContent', 'replacementContent']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'run_command',
      description: 'Execute a native shell bash command on the project machine system environment (e.g., git, npm install, npm test, node script.js).',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The complete shell command phrase to run' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'browser_action',
      description: 'Open a web page or perform browser automation. For action "navigate", opens the URL in the system browser directly.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Action to perform: navigate | click | fill | evaluate | screenshot | close' },
          url: { type: 'string', description: 'URL to visit (for navigate action)' },
          selector: { type: 'string', description: 'CSS selector (for click, fill actions)' },
          text: { type: 'string', description: 'Text to type (for fill action)' },
          script: { type: 'string', description: 'JavaScript code to execute in browser context (for evaluate action). The code runs inside the page.evaluate() block.' }
        },
        required: ['action']
      }
    }
  }
];

export interface StructuredToolResult {
  ok: boolean;
  success: boolean;
  durationMs: number;
  errorCode?: string;
  exitCode?: number;
  truncated?: boolean;
  [key: string]: any;
}

const BLOCKED_FILE_PATTERNS = [
  /(^|[/\\])\.env($|\..*)/i,
  /(^|[/\\])\.git($|[/\\])/i,
  /(^|[/\\])id_[a-z0-9_]+/i,
  /(^|[/\\])\.npmrc/i,
  /(^|[/\\])\.aws($|[/\\])/i,
  /(^|[/\\])\.ssh($|[/\\])/i,
];

export function isSecretPath(filePath: string): boolean {
  return BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Validates that a file path resides safely within the active workspace.
 * Resolves symlinks via fs.realpath to defeat path traversal and UNC/symlink escapes (S-4).
 * Enforces secret exclusion (AG-13).
 */
export async function resolveSafeWorkspacePath(rawPath: string, allowMissing = false): Promise<string> {
  const cwd = process.cwd();
  let realCwd: string;
  try {
    realCwd = await fs.realpath(cwd);
  } catch {
    realCwd = path.resolve(cwd);
  }

  const rootWithSep = realCwd.endsWith(path.sep) ? realCwd : realCwd + path.sep;

  const normalized = path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(cwd, rawPath);

  if (!normalized.startsWith(rootWithSep) && normalized !== realCwd) {
    throw new Error(`Path traversal denied: file "${rawPath}" escapes workspace directory.`);
  }

  if (isSecretPath(normalized)) {
    throw new Error(`Security violation: Access to sensitive or credential file "${path.basename(normalized)}" is blocked.`);
  }

  if (allowMissing) {
    let checkDir = path.dirname(normalized);
    while (checkDir && checkDir !== path.dirname(checkDir)) {
      try {
        const realParent = await fs.realpath(checkDir);
        if (!realParent.startsWith(rootWithSep) && realParent !== realCwd) {
          throw new Error(`Path traversal denied: target directory "${rawPath}" escapes workspace.`);
        }
        break;
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          checkDir = path.dirname(checkDir);
          continue;
        }
        throw err;
      }
    }
    return normalized;
  }

  const realTarget = await fs.realpath(normalized);
  if (!realTarget.startsWith(rootWithSep) && realTarget !== realCwd) {
    throw new Error(`Path traversal denied: file "${rawPath}" escapes workspace directory.`);
  }
  return realTarget;
}

/**
 * Saves a pre-modification backup snapshot before modifying a file (AG-9).
 */
export async function saveSnapshot(targetPath: string): Promise<void> {
  try {
    const exists = await fs.access(targetPath).then(() => true).catch(() => false);
    if (!exists) return;

    const snapshotDir = path.resolve(process.cwd(), '.locus', 'snapshots');
    await fs.mkdir(snapshotDir, { recursive: true });

    const content = await fs.readFile(targetPath, 'utf-8');
    const filename = `${path.basename(targetPath)}.${Date.now()}.bak`;
    const snapshotPath = path.join(snapshotDir, filename);

    await fs.writeFile(snapshotPath, content, 'utf-8');
    await fs.writeFile(
      path.join(snapshotDir, 'last_edit.json'),
      JSON.stringify({ targetPath, snapshotPath, timestamp: Date.now() }),
      'utf-8'
    );
  } catch {}
}

/**
 * Reverts the most recently edited file to its snapshot backup (AG-9).
 */
export async function undoLastEdit(): Promise<{ ok: boolean; message: string }> {
  try {
    const snapshotDir = path.resolve(process.cwd(), '.locus', 'snapshots');
    const pointer = path.join(snapshotDir, 'last_edit.json');
    const meta = JSON.parse(await fs.readFile(pointer, 'utf-8'));

    const backup = await fs.readFile(meta.snapshotPath, 'utf-8');
    await fs.writeFile(meta.targetPath, backup, 'utf-8');
    await fs.unlink(pointer);

    return {
      ok: true,
      message: `Successfully reverted ${path.basename(meta.targetPath)} to pre-edit snapshot.`,
    };
  } catch {
    return {
      ok: false,
      message: 'No previous edit snapshot found to undo.',
    };
  }
}

export async function executeTool(name: string, args: any): Promise<string> {
  const startTime = Date.now();

  const wrapResult = (data: Record<string, any>): string => {
    const durationMs = Date.now() - startTime;
    const ok = data.ok !== undefined ? Boolean(data.ok) : (data.success !== undefined ? Boolean(data.success) : !data.error);
    const envelope = {
      ok,
      success: ok,
      durationMs,
      ...data,
    };
    // P-3: Redact sensitive credential patterns from tool output
    const sanitized = JSON.parse(
      JSON.stringify(envelope).replace(/(sk-[a-zA-Z0-9_-]{20,})|(ghp_[a-zA-Z0-9]{20,})|(Bearer\s+[a-zA-Z0-9_-]{20,})/gi, '[REDACTED_SECRET]')
    );
    return JSON.stringify(sanitized);
  };

  try {
    if (name === 'search_workspace') {
      const pattern = args.query ? `**/${args.query}*` : '**/*';
      const matches = await glob(pattern, {
        cwd: process.cwd(),
        ignore: ['node_modules/**', '.git/**', 'dist/**', '**/.env*', '**/.ssh/**'],
        nodir: false
      });
      // X-5: Prioritize exact basename matches
      const queryLower = (args.query || '').toLowerCase();
      matches.sort((a, b) => {
        const aBase = path.basename(a).toLowerCase();
        const bBase = path.basename(b).toLowerCase();
        if (queryLower) {
          if (aBase === queryLower && bBase !== queryLower) return -1;
          if (bBase === queryLower && aBase !== queryLower) return 1;
        }
        return a.length - b.length;
      });

      const truncated = matches.length > 100;
      return wrapResult({
        ok: true,
        truncated,
        workspaceFiles: matches.slice(0, 100) // Cap at 100 for token limits
      });
    }

    if (name === 'find_symbol') {
      const query = (args.query || '').trim();
      if (!query) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'query is required' });

      const files = await glob('**/*.{ts,tsx,js,jsx,py,go,rs}', {
        cwd: process.cwd(),
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '.locus/**'],
        nodir: true,
      });

      const results: Array<{ filePath: string; line: number; kind: string; signature: string }> = [];
      const queryLower = query.toLowerCase();

      for (const file of files.slice(0, 80)) {
        try {
          const content = await fs.readFile(path.resolve(process.cwd(), file), 'utf-8');
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.toLowerCase().includes(queryLower)) continue;

            let kind = '';
            if (/\b(function|def|func|fn)\s+[A-Za-z0-9_$]+/.test(line) || /async\s+function\s+/.test(line)) kind = 'function';
            else if (/\b(class|struct)\s+[A-Za-z0-9_$]+/.test(line)) kind = 'class';
            else if (/\binterface\s+[A-Za-z0-9_$]+/.test(line)) kind = 'interface';
            else if (/\btype\s+[A-Za-z0-9_$]+\s*=/.test(line)) kind = 'type';
            else if (/\b(const|let|var)\s+[A-Za-z0-9_$]+\s*=/.test(line)) kind = 'variable';

            if (kind && (!args.kind || args.kind.toLowerCase() === kind)) {
              results.push({
                filePath: file,
                line: i + 1,
                kind,
                signature: line.trim().slice(0, 120),
              });
              if (results.length >= 25) break;
            }
          }
          if (results.length >= 25) break;
        } catch {}
      }

      return wrapResult({
        ok: true,
        query,
        count: results.length,
        symbols: results,
      });
    }

    if (name === 'read_file') {
      if (!args.filePath) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'filePath is required' });
      const safePath = await resolveSafeWorkspacePath(args.filePath, false);
      const data = await fs.readFile(safePath, 'utf-8');

      if (args.startLine !== undefined || args.endLine !== undefined) {
        const lines = data.replace(/\r\n/g, '\n').split('\n');
        const start = Math.max(1, typeof args.startLine === 'number' ? args.startLine : 1);
        const end = Math.min(lines.length, typeof args.endLine === 'number' ? args.endLine : lines.length);
        const sliced = lines.slice(start - 1, end).join('\n');
        return wrapResult({
          ok: true,
          content: sliced,
          startLine: start,
          endLine: end,
          totalLines: lines.length,
        });
      }

      return wrapResult({ ok: true, content: data });
    }

    if (name === 'write_file') {
      if (!args.filePath) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'filePath is required' });
      const safePath = await resolveSafeWorkspacePath(args.filePath, true);
      await saveSnapshot(safePath);
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, args.content ?? '', 'utf-8');
      return wrapResult({ ok: true, message: `Successfully wrote file to ${args.filePath}` });
    }

    if (name === 'edit_file') {
      const { filePath, targetContent, replacementContent, allowMultiple } = args;
      if (!filePath || targetContent === undefined || replacementContent === undefined) {
        return wrapResult({
          ok: false,
          errorCode: 'INVALID_ARGS',
          error: 'filePath, targetContent, and replacementContent are required for edit_file',
        });
      }

      const safePath = await resolveSafeWorkspacePath(filePath, false);
      const original = await fs.readFile(safePath, 'utf-8');

      if (!original.includes(targetContent)) {
        // Try fuzzy newline normalization (\r\n vs \n)
        const normOriginal = original.replace(/\r\n/g, '\n');
        const normTarget = targetContent.replace(/\r\n/g, '\n');
        const normReplacement = replacementContent.replace(/\r\n/g, '\n');

        if (!normOriginal.includes(normTarget)) {
          return wrapResult({
            ok: false,
            errorCode: 'TARGET_NOT_FOUND',
            error: `Target content not found in "${filePath}". Ensure exact whitespace and line match.`,
          });
        }

        const occurrences = normOriginal.split(normTarget).length - 1;
        if (occurrences > 1 && !allowMultiple) {
          return wrapResult({
            ok: false,
            errorCode: 'AMBIGUOUS_MATCH',
            error: `Target content found ${occurrences} times in "${filePath}". Provide more surrounding lines to make it unique, or pass allowMultiple: true.`,
          });
        }

        const updated = allowMultiple
          ? normOriginal.replaceAll(normTarget, normReplacement)
          : normOriginal.replace(normTarget, normReplacement);

        await saveSnapshot(safePath);
        await fs.writeFile(safePath, updated, 'utf-8');
        return wrapResult({ ok: true, message: `Successfully edited ${filePath}` });
      }

      const occurrences = original.split(targetContent).length - 1;
      if (occurrences > 1 && !allowMultiple) {
        return wrapResult({
          ok: false,
          errorCode: 'AMBIGUOUS_MATCH',
          error: `Target content found ${occurrences} times in "${filePath}". Provide more surrounding lines to make it unique, or pass allowMultiple: true.`,
        });
      }

      const updated = allowMultiple
        ? original.replaceAll(targetContent, replacementContent)
        : original.replace(targetContent, replacementContent);

      await saveSnapshot(safePath);
      await fs.writeFile(safePath, updated, 'utf-8');
      return wrapResult({ ok: true, message: `Successfully edited ${filePath}` });
    }

    if (name === 'run_command') {
      const commandStr = (args.command ?? '').trim();
      if (!commandStr) {
        return wrapResult({ ok: false, errorCode: 'EMPTY_COMMAND', error: 'No command phrase provided' });
      }

      // S-9: Scrub sensitive environment credentials from child process
      const cleanEnv = { ...process.env };
      delete cleanEnv.AWS_SECRET_ACCESS_KEY;
      delete cleanEnv.OPENAI_API_KEY;
      delete cleanEnv.ANTHROPIC_API_KEY;
      delete cleanEnv.GITHUB_TOKEN;
      delete cleanEnv.GH_TOKEN;

      // S-10: Optional Docker container sandbox execution backend
      let finalCmd = commandStr;
      let usedDockerSandbox = false;
      if (process.env.LOCUS_SANDBOX === 'docker' || args.sandbox === 'docker') {
        const { exitCode: dockerCheck } = await execa({ shell: true, reject: false })`docker info`;
        if (dockerCheck === 0) {
          const cwd = process.cwd();
          finalCmd = `docker run --rm -v "${cwd}:/workspace" -w /workspace node:20-alpine sh -c ${JSON.stringify(commandStr)}`;
          usedDockerSandbox = true;
        }
      }

      const { stdout, stderr, exitCode } = await execa({
        shell: true,
        reject: false,
        timeout: 120_000,
        env: cleanEnv,
      })`${finalCmd}`;

      const ok = exitCode === 0;
      return wrapResult({
        ok,
        success: ok,
        exitCode: exitCode ?? 0,
        stdout: stdout?.trim() || '',
        stderr: stderr?.trim() || '',
        sandboxed: usedDockerSandbox,
      });
    }

    if (name === 'browser_action') {
      const { action, url, selector, text, script } = args;

      if (action === 'close') {
        if (globalContext) {
          try { await globalContext.close(); } catch {}
        }
        if (globalBrowser) {
          try { await globalBrowser.close(); } catch {}
        }
        globalBrowser = null;
        globalContext = null;
        globalPage = null;
        return wrapResult({ ok: true, message: 'Browser session closed.' });
      }

      // Try loading Playwright dynamically if not already active
      let chromiumModule: any = null;
      if (!globalBrowser) {
        try {
          // @ts-ignore
          const pw = await import('playwright');
          chromiumModule = pw.chromium || pw.default?.chromium;
        } catch {}

        if (!chromiumModule) {
          try {
            // @ts-ignore
            const pw = await import('playwright-core');
            chromiumModule = pw.chromium || pw.default?.chromium;
          } catch {}
        }
      }

      // Fall back directly to default system browser for navigate action
      if (!globalBrowser && !chromiumModule) {
        if (action === 'navigate' || (!action && url)) {
          if (!url) {
            return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'url is required for navigate action' });
          }
          const opened = await openInSystemBrowser(url);
          if (opened) {
            return wrapResult({
              ok: true,
              message: `Opened ${url} in your system browser.`,
            });
          }
          return wrapResult({
            ok: false,
            errorCode: 'OPEN_FAILED',
            error: `Failed to open ${url} in system browser.`,
          });
        }

        return wrapResult({
          ok: false,
          errorCode: 'PLAYWRIGHT_NOT_FOUND',
          error: `Automated DOM interaction ('${action}') requires Playwright. For opening or viewing pages, use action 'navigate' with a URL to open it in your system browser.`,
        });
      }

      // Playwright is available: initialize instance
      if (!globalBrowser) {
        const recordingsDir = path.resolve(process.cwd(), 'recordings');
        await fs.mkdir(recordingsDir, { recursive: true });

        globalBrowser = await launchChromiumBrowser(chromiumModule);
        let context: any;
        try {
          context = await globalBrowser.newContext({
            recordVideo: { dir: recordingsDir },
          });
        } catch {
          context = await globalBrowser.newContext();
        }
        globalContext = context;
        globalPage = await globalContext.newPage();
      }

      if (!globalPage) {
        if (action === 'navigate' && url) {
          const opened = await openInSystemBrowser(url);
          if (opened) {
            return wrapResult({ ok: true, message: `Opened ${url} in your system browser.` });
          }
        }
        return wrapResult({ ok: false, errorCode: 'BROWSER_INIT_FAILED', error: 'Browser failed to initialize. Ensure Google Chrome, Microsoft Edge, or Chromium is installed.' });
      }

      switch (action) {
        case 'navigate':
          if (!url) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'url is required for navigate' });
          await globalPage.goto(url, { waitUntil: 'domcontentloaded' });
          return wrapResult({ ok: true, message: `Navigated to ${await globalPage.title()}` });

        case 'click':
          if (!selector) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'selector is required for click' });
          await globalPage.click(selector);
          return wrapResult({ ok: true, message: `Clicked element matching '${selector}'` });

        case 'fill':
          if (!selector || text === undefined) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'selector and text are required for fill' });
          await globalPage.fill(selector, text);
          return wrapResult({ ok: true, message: `Filled element matching '${selector}' with text` });

        case 'evaluate':
          if (!script) return wrapResult({ ok: false, errorCode: 'INVALID_ARGS', error: 'script is required for evaluate' });
          const result = await globalPage.evaluate(script);
          return wrapResult({ ok: true, result });

        case 'content':
        case 'extract':
          const pageText = await globalPage.evaluate(() => {
            const body = document.body;
            return body ? body.innerText : document.documentElement.outerHTML;
          });
          const pageTitle = await globalPage.title();
          const pageUrl = globalPage.url();
          return wrapResult({
            ok: true,
            title: pageTitle,
            url: pageUrl,
            content: (pageText || '').slice(0, 12000),
            message: `Extracted content from ${pageTitle} (${pageUrl})`,
          });

        case 'screenshot':
          const screenshotPath = path.resolve(process.cwd(), `screenshot-${Date.now()}.png`);
          await globalPage.screenshot({ path: screenshotPath });
          return wrapResult({ ok: true, message: `Screenshot saved to ${screenshotPath}` });

        default:
          return wrapResult({ ok: false, errorCode: 'UNKNOWN_ACTION', error: `Unknown browser action: ${action}` });
      }
    }

    return wrapResult({ ok: false, errorCode: 'TOOL_NOT_FOUND', error: `Tool ${name} not found.` });
  } catch (error: any) {
    return wrapResult({ ok: false, errorCode: error.code || 'EXECUTION_ERROR', error: error.message });
  }
}

/**
 * Normalises a potentially-mangled tool name returned by a model that
 * concatenates or partially-emits function names during streaming.
 * Falls back to the original string if no known tool matches.
 */
const KNOWN_TOOL_NAMES = [
  'search_workspace',
  'find_symbol',
  'read_file',
  'write_file',
  'edit_file',
  'run_command',
  'browser_action',
] as const;

export function normalizeToolName(name: string): string {
  return KNOWN_TOOL_NAMES.find((t) => name.includes(t)) ?? name;
}

import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { glob } from 'glob';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

// Global state for stateful browser sessions
let globalBrowser: Browser | null = null;
let globalContext: BrowserContext | null = null;
let globalPage: Page | null = null;

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
      name: 'read_file',
      description: 'Read the text content of an absolute or relative file within the active directory.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'The relative path to the file' }
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
      description: 'Perform a stateful browser action. Automatically launches a Chromium browser with video recording on first use.',
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

export async function executeTool(name: string, args: any): Promise<string> {
  // Correctly resolve absolute or relative paths.
  // path.resolve(cwd, absolutePath) would mangle the absolute path, so we check first.
  const targetPath = args.filePath
    ? path.isAbsolute(args.filePath)
      ? path.normalize(args.filePath)
      : path.resolve(process.cwd(), args.filePath)
    : process.cwd();

  try {
    if (name === 'search_workspace') {
      const pattern = args.query ? `**/${args.query}*` : '**/*';
      const matches = await glob(pattern, {
        cwd: process.cwd(),
        ignore: ['node_modules/**', '.git/**', 'dist/**'],
        nodir: false
      });
      return JSON.stringify({ success: true, workspaceFiles: matches.slice(0, 100) }); // Cap at 100 for token limits
    }

    if (name === 'read_file') {
      const data = await fs.readFile(targetPath, 'utf-8');
      return JSON.stringify({ success: true, content: data });
    }

    if (name === 'write_file') {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, args.content, 'utf-8');
      return JSON.stringify({ success: true, message: `Successfully wrote file to ${args.filePath}` });
    }

    if (name === 'run_command') {
      // Execute bash instruction asynchronously using execa
      const { stdout, stderr } = await execa({ shell: true, reject: false })`${args.command}`;
      return JSON.stringify({
        success: true,
        stdout: stdout?.trim() || '',
        stderr: stderr?.trim() || ''
      });
    }

    if (name === 'browser_action') {
      const { action, url, selector, text, script } = args;

      // Auto-initialize browser on first non-close action
      if (!globalBrowser && action !== 'close') {
        const recordingsDir = path.resolve(process.cwd(), 'recordings');
        await fs.mkdir(recordingsDir, { recursive: true });
        
        globalBrowser = await chromium.launch({ headless: false }); // Show browser to user
        globalContext = await globalBrowser.newContext({
          recordVideo: { dir: recordingsDir }
        });
        globalPage = await globalContext.newPage();
      }

      if (!globalPage && action !== 'close') {
        return JSON.stringify({ success: false, error: 'Browser failed to initialize.' });
      }

      switch (action) {
        case 'navigate':
          if (!url) return JSON.stringify({ success: false, error: 'url is required for navigate' });
          await globalPage!.goto(url, { waitUntil: 'domcontentloaded' });
          return JSON.stringify({ success: true, message: `Navigated to ${await globalPage!.title()}` });
        
        case 'click':
          if (!selector) return JSON.stringify({ success: false, error: 'selector is required for click' });
          await globalPage!.click(selector);
          return JSON.stringify({ success: true, message: `Clicked element matching '${selector}'` });
        
        case 'fill':
          if (!selector || text === undefined) return JSON.stringify({ success: false, error: 'selector and text are required for fill' });
          await globalPage!.fill(selector, text);
          return JSON.stringify({ success: true, message: `Filled element matching '${selector}' with text` });
        
        case 'evaluate':
          if (!script) return JSON.stringify({ success: false, error: 'script is required for evaluate' });
          const result = await globalPage!.evaluate(script);
          return JSON.stringify({ success: true, result });
        
        case 'screenshot':
          const screenshotPath = path.resolve(process.cwd(), `screenshot-${Date.now()}.png`);
          await globalPage!.screenshot({ path: screenshotPath });
          return JSON.stringify({ success: true, message: `Screenshot saved to ${screenshotPath}` });
        
        case 'close':
          if (globalContext) {
            await globalContext.close(); // Ensures video is fully flushed and saved
          }
          if (globalBrowser) {
            await globalBrowser.close();
          }
          globalBrowser = null;
          globalContext = null;
          globalPage = null;
          return JSON.stringify({ success: true, message: 'Browser session closed successfully. Video saved in ./recordings' });
        
        default:
          return JSON.stringify({ success: false, error: `Unknown browser action: ${action}` });
      }
    }

    return JSON.stringify({ error: `Tool ${name} not found.` });
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

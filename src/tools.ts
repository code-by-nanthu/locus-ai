import * as fs from 'fs/promises';
import * as path from 'path';
import { execa } from 'execa';
import { glob } from 'glob';

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
  }
];

export async function executeTool(name: string, args: any): Promise<string> {
  const targetPath = path.resolve(process.cwd(), args.filePath || '.');

  // Security check: Keep the agent constrained inside the active directory workspace
  if (args.filePath && !targetPath.startsWith(process.cwd())) {
    return JSON.stringify({ error: "Access Denied: Attempting to escape context project boundary paths." });
  }

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

    return JSON.stringify({ error: `Tool ${name} not found.` });
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

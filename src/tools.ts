import * as fs from 'fs/promises';
import * as path from 'path';

// 1. Declare the structural tool blueprints for the OpenAI API format
export const toolDefinitions = [
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
  }
];

// 2. Concrete local runner implementations
export async function executeTool(name: string, args: any): Promise<string> {
  const targetPath = path.resolve(process.cwd(), args.filePath);

  // Security boundary: Stop the LLM from escaping your project workspace directory
  if (!targetPath.startsWith(process.cwd())) {
    return JSON.stringify({ error: "Access Denied: Cannot modify directories outside the project root." });
  }

  try {
    if (name === 'read_file') {
      const data = await fs.readFile(targetPath, 'utf-8');
      return JSON.stringify({ success: true, content: data });
    }

    if (name === 'write_file') {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, args.content, 'utf-8');
      return JSON.stringify({ success: true, message: `Successfully wrote file to ${args.filePath}` });
    }

    return JSON.stringify({ error: `Tool ${name} not found.` });
  } catch (error: any) {
    return JSON.stringify({ success: false, error: error.message });
  }
}

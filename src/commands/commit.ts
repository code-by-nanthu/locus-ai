import { execa } from 'execa';
import * as readline from 'readline';
import { loadConfig } from '../core/config.js';
import { getLocalClient } from '../services/llm.js';

export async function runCommitCommand() {
  const config = await loadConfig();
  if (!config || !config.defaultProvider || !config.defaultModel) {
    console.error('Error: Default provider and model are not set. Start Locus once to configure them.');
    process.exit(1);
  }

  try {
    // Check if it's a git repository
    await execa('git', ['rev-parse', '--is-inside-work-tree']);
  } catch {
    console.error('Error: Not a git repository.');
    process.exit(1);
  }

  // Get staged changes
  let { stdout: diff } = await execa('git', ['diff', '--cached']);
  if (!diff.trim()) {
    // Fallback to unstaged changes if nothing is staged
    const { stdout: unstagedDiff } = await execa('git', ['diff']);
    if (!unstagedDiff.trim()) {
      console.log('No changes to commit.');
      process.exit(0);
    }
    console.log('No staged changes found. Using unstaged changes to generate message.');
    diff = unstagedDiff;
  }

  // Cap diff size to avoid blowing up the token limit
  if (diff.length > 20000) {
    console.warn('Warning: Diff is very large, truncating for the AI...');
    diff = diff.slice(0, 20000);
  }

  console.log('Generating commit message...');

  const client = getLocalClient(config.defaultProvider, config.baseURLs?.[config.defaultProvider]);
  
  const systemPrompt = `You are an expert developer. Generate a single commit message for the provided git diff.
Use the standard "Conventional Commits" format (e.g., feat: add authentication, fix(api): resolve timeout).
Do NOT include any explanations, markdown code blocks, or additional text. Just output the raw commit message.`;

  try {
    const response = await client.chat.completions.create({
      model: config.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Here is the diff:\n\n${diff}` }
      ],
      temperature: 0.2,
    });

    let message = response.choices[0]?.message?.content?.trim() || '';
    // Strip possible markdown ticks if the model stubbornly adds them
    message = message.replace(/^```[\s\S]*?\n/g, '').replace(/```$/g, '').trim();

    if (!message) {
      console.error('Failed to generate a commit message.');
      process.exit(1);
    }

    console.log('\nProposed commit message:');
    console.log('\x1b[36m%s\x1b[0m', message); // Cyan color
    console.log();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Commit with this message? [Y/n] ', async (answer) => {
      rl.close();
      if (answer.toLowerCase() === 'y' || answer.trim() === '') {
        try {
          // If we used unstaged changes because nothing was staged, we should add them first
          const { stdout: checkStaged } = await execa('git', ['diff', '--cached']);
          if (!checkStaged.trim()) {
             await execa('git', ['add', '.']);
          }
          await execa('git', ['commit', '-m', message]);
          console.log('Successfully committed.');
        } catch (err: any) {
          console.error('Git commit failed:', err.message);
        }
      } else {
        console.log('Commit aborted.');
      }
    });

  } catch (error: any) {
    console.error('AI Request failed:', error.message);
    process.exit(1);
  }
}

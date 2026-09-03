import { execa } from 'execa';
import { APP_VERSION } from '../../version.js';

export async function runUpdateCommand(): Promise<void> {
  console.log('\n\x1b[36mChecking for Locus updates...\x1b[0m');
  const currentVersion = APP_VERSION;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('https://api.github.com/repos/code-by-nanthu/locus-ai/releases/latest', {
      signal: controller.signal,
      headers: { 'User-Agent': 'locus-cli' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log('\n\x1b[33mNo tagged release found yet. Checking latest commits on main branch...\x1b[0m');
      try {
        const commitRes = await fetch('https://api.github.com/repos/code-by-nanthu/locus-ai/commits/main', {
          headers: { 'User-Agent': 'locus-cli' },
        });
        if (commitRes.ok) {
          const commitData: any = await commitRes.json();
          const shortSha = (commitData.sha || '').slice(0, 7);
          const msg = commitData.commit?.message?.split('\n')[0] || '';
          console.log(`Latest commit on main: \x1b[36m${shortSha}\x1b[0m ("${msg}")`);
          console.log('Downloading and updating to latest changes from repository...\n');

          if (process.platform === 'win32') {
            await execa({ stdio: 'inherit', shell: true })`powershell -Command "irm https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.ps1 | iex"`;
          } else {
            await execa({ stdio: 'inherit', shell: true })`curl -fsSL https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.sh | bash`;
          }
          console.log(`\n\x1b[32m✨ Successfully updated Locus to latest commit (${shortSha})!\x1b[0m\n`);
          return;
        }
      } catch {}

      console.log(`\n\x1b[33mNo published releases found online yet. You are running Locus v${currentVersion}.\x1b[0m\n`);
      return;
    }

    const release: any = await res.json();
    const latestTag = (release.tag_name || '').replace(/^v/, '');

    if (!latestTag || latestTag === currentVersion) {
      console.log(`\n\x1b[32m✨ Locus is already up to date (v${currentVersion}).\x1b[0m\n`);
      return;
    }

    console.log(`\n\x1b[33mUpdate found: v${currentVersion} → v${latestTag}\x1b[0m`);
    console.log('Downloading and installing latest native binary...\n');

    if (process.platform === 'win32') {
      await execa({ stdio: 'inherit', shell: true })`powershell -Command "irm https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.ps1 | iex"`;
    } else {
      await execa({ stdio: 'inherit', shell: true })`curl -fsSL https://raw.githubusercontent.com/code-by-nanthu/locus-ai/main/scripts/install.sh | bash`;
    }

    console.log(`\n\x1b[32m✨ Successfully updated to v${latestTag}!\x1b[0m\n`);
  } catch (err: any) {
    console.error(`\n\x1b[31mUpdate check failed: ${err.message}\x1b[0m\n`);
  }
}

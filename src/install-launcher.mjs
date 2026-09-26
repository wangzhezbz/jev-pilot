import { readFileSync, writeFileSync, existsSync, lstatSync, linkSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function configuredLauncher(home, config, platform = process.platform) {
  const name = config?.launcherFile || (platform === 'win32' ? 'jev-pilot.exe' : 'jev-pilot');
  const valid = platform === 'win32' ? /^jev-pilot(?:-[a-f0-9]{64})?\.exe$/ : /^jev-pilot$/;
  if (!valid.test(name)) throw Error('INVALID_LAUNCHER_FILE');
  return join(home, name);
}

// A running Windows executable cannot be overwritten. Reuse equal bytes, or
// publish a new content-addressed executable beside it and switch at activation.
// Keeping the same directory is required by the launcher's config lookup.
export function installLauncher({ source, home, platform = process.platform, publish = linkSync }) {
  const bytes = readFileSync(source), sha256 = digest(bytes);
  const base = configuredLauncher(home, null, platform);
  const equal = path => {
    if (!existsSync(path)) return false;
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw Error('UNSAFE_LAUNCHER_PATH');
    return readFileSync(path).equals(bytes);
  };
  if (equal(base)) return { launcher: base, launcherFile: base.split(/[\\/]/).at(-1), reused: true, sha256 };
  const name = platform === 'win32' && existsSync(base) ? `jev-pilot-${sha256}.exe` : platform === 'win32' ? 'jev-pilot.exe' : 'jev-pilot';
  const launcher = join(home, name);
  if (equal(launcher)) return { launcher, launcherFile: name, reused: true, sha256 };
  if (platform === 'win32' && existsSync(launcher)) throw Error('LAUNCHER_HASH_CONFLICT');
  const temporary = join(home, `.jev-launcher-${randomUUID()}.tmp`);
  writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o700 });
  try {
    if (platform === 'win32') {
      try { publish(temporary, launcher); }
      catch (error) { if (error.code !== 'EEXIST' || !equal(launcher)) throw error; }
    } else renameSync(temporary, launcher);
    if (!equal(launcher)) throw Error('LAUNCHER_VERIFY_FAILED');
  } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  return { launcher, launcherFile: name, reused: false, sha256 };
}

import { app } from 'electron';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { cpRecursiveSync } from '../fsCompat';

const MSET_DIR_NAME = 'mset';
const MSET_EXE = 'mset.exe';
const MSET_STATE_FILE = 'mset-state.json';
const NODE_VERSION = '22.16.0';
const UV_VERSION = '0.7.11';
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per install

interface MsetState {
  syncedAt: number;
  nodeVersion: string;
  uvVersion: string;
  nodeInstalled: boolean;
  uvInstalled: boolean;
}

function getBundledMsetDir(): string | null {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, MSET_DIR_NAME),
      ]
    : [
        path.join(path.resolve(__dirname, '..', '..', '..'), 'resources', MSET_DIR_NAME),
        path.join(process.cwd(), 'resources', MSET_DIR_NAME),
      ];

  for (const candidate of candidates) {
    const exePath = path.join(candidate, MSET_EXE);
    if (fs.existsSync(exePath)) {
      return candidate;
    }
  }
  return null;
}

function getUserMsetHome(): string {
  return path.join(app.getPath('userData'), 'runtimes', MSET_DIR_NAME);
}

function getMsetExePath(msetHome: string): string {
  return path.join(msetHome, 'bin', MSET_EXE);
}

function readState(msetHome: string): MsetState | null {
  const statePath = path.join(msetHome, MSET_STATE_FILE);
  try {
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch {
    // corrupted state file
  }
  return null;
}

function writeState(msetHome: string, state: MsetState): void {
  const statePath = path.join(msetHome, MSET_STATE_FILE);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function isStateUpToDate(state: MsetState | null): boolean {
  if (!state) return false;
  return (
    state.nodeVersion === NODE_VERSION &&
    state.uvVersion === UV_VERSION &&
    state.nodeInstalled &&
    state.uvInstalled
  );
}

function installTool(msetExe: string, msetHome: string, toolSpec: string): boolean {
  try {
    console.log(`[mset-runtime] Installing ${toolSpec}...`);
    const result = spawnSync(msetExe, ['--install', toolSpec], {
      cwd: msetHome,
      env: {
        ...process.env,
        MSET_HOME: msetHome,
      },
      timeout: INSTALL_TIMEOUT_MS,
      windowsHide: true,
      stdio: 'pipe',
    });

    if (result.status === 0) {
      console.log(`[mset-runtime] ${toolSpec} installed successfully`);
      return true;
    }

    const stderr = result.stderr?.toString().trim();
    console.error(`[mset-runtime] ${toolSpec} install failed (exit ${result.status}): ${stderr || '(no output)'}`);
    return false;
  } catch (error) {
    console.error(`[mset-runtime] ${toolSpec} install error:`, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Ensure mset runtime is ready: copy bundled mset.exe to userData,
 * install Node.js and UV if not yet installed.
 * Called once at app startup.
 */
export function ensureMsetRuntimeReady(): { success: boolean; msetHome: string | null; error?: string } {
  if (process.platform !== 'win32') {
    return { success: true, msetHome: null };
  }

  const bundledDir = getBundledMsetDir();
  if (!bundledDir) {
    console.log('[mset-runtime] No bundled mset found, skipping');
    return { success: true, msetHome: null };
  }

  const msetHome = getUserMsetHome();
  const binDir = path.join(msetHome, 'bin');
  const msetExe = getMsetExePath(msetHome);

  // Copy mset.exe to userData if missing or outdated
  try {
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const bundledExe = path.join(bundledDir, MSET_EXE);
    const bundledStat = fs.statSync(bundledExe);
    const needsCopy = !fs.existsSync(msetExe) ||
      fs.statSync(msetExe).size !== bundledStat.size;

    if (needsCopy) {
      fs.copyFileSync(bundledExe, msetExe);
      console.log(`[mset-runtime] Copied ${MSET_EXE} to ${binDir}`);
    }
  } catch (error) {
    const msg = `Failed to copy mset.exe: ${error instanceof Error ? error.message : error}`;
    console.error(`[mset-runtime] ${msg}`);
    return { success: false, msetHome: null, error: msg };
  }

  // Check if runtimes are already installed
  const state = readState(msetHome);
  if (isStateUpToDate(state)) {
    console.log('[mset-runtime] Runtimes already up to date');
    return { success: true, msetHome };
  }

  // Install runtimes
  const nodeInstalled = installTool(msetExe, msetHome, `node=${NODE_VERSION}`);
  const uvInstalled = installTool(msetExe, msetHome, `uv=${UV_VERSION}`);

  writeState(msetHome, {
    syncedAt: Date.now(),
    nodeVersion: NODE_VERSION,
    uvVersion: UV_VERSION,
    nodeInstalled,
    uvInstalled,
  });

  if (!nodeInstalled || !uvInstalled) {
    const failed = [!nodeInstalled && 'Node.js', !uvInstalled && 'UV'].filter(Boolean).join(', ');
    return { success: false, msetHome, error: `Failed to install: ${failed}` };
  }

  return { success: true, msetHome };
}

/**
 * Append mset runtime paths (node, uv, mset bin) to environment variables.
 * Called from getEnhancedEnv() on every child process creation.
 */
export function appendMsetRuntimeToEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  if (process.platform !== 'win32') {
    return env;
  }

  const msetHome = getUserMsetHome();
  if (!fs.existsSync(msetHome)) {
    return env;
  }

  // Set MSET_HOME so mset.exe can find its runtimes
  env.MSET_HOME = msetHome;

  const pathEntries: string[] = [];
  const binDir = path.join(msetHome, 'bin');

  // Add mset bin dir (contains mset.exe)
  if (fs.existsSync(path.join(binDir, MSET_EXE))) {
    pathEntries.push(binDir);
  }

  // Add Node.js runtime path
  const nodeDir = path.join(msetHome, 'res', `node-v${NODE_VERSION}`);
  if (fs.existsSync(nodeDir)) {
    pathEntries.push(nodeDir);
  }

  // Add UV runtime path
  const uvDir = path.join(msetHome, 'res', `uv-${UV_VERSION}`);
  if (fs.existsSync(uvDir)) {
    pathEntries.push(uvDir);
  }

  if (pathEntries.length > 0) {
    const currentPath = env.PATH || '';
    const existingEntries = new Set(currentPath.split(';').map(p => p.toLowerCase().replace(/[\\/]+$/, '')));
    const newEntries = pathEntries.filter(p => !existingEntries.has(p.toLowerCase().replace(/[\\/]+$/, '')));
    if (newEntries.length > 0) {
      env.PATH = [...newEntries, currentPath].filter(Boolean).join(';');
    }
  }

  return env;
}

import { ChildProcess, spawn, spawnSync } from 'child_process';
import { app } from 'electron';
import path from 'path';
import net from 'net';
import fs from 'fs';
import { appendPythonRuntimeToEnv, getUserPythonRoot } from './pythonRuntime';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort: number = 0;
let sidecarReady = false;
let restartCount = 0;
let depsInstalled = false;
const MAX_RESTARTS = 3;

function getSkillsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'SKILLs')
    : path.join(app.getAppPath(), 'SKILLs');
}

function getSidecarDir(): string {
  return path.join(getSkillsRoot(), 'knowledge-base', 'sidecar');
}

/**
 * Resolve the Python executable command.
 * On Windows, use the built-in runtime's python.exe; on macOS/Linux, use python3.
 */
function getPythonCommand(): string {
  if (process.platform === 'win32') {
    // Try built-in runtime first
    const userRoot = getUserPythonRoot();
    const candidates = [
      path.join(userRoot, 'python.exe'),
      path.join(userRoot, 'python3.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    // Fallback to PATH
    return 'python';
  }
  return 'python3';
}

/**
 * Ensure sidecar pip dependencies are installed.
 * Runs `pip install --user -r requirements.txt` once per app session.
 */
function ensureDeps(pythonCmd: string, sidecarDir: string, env: Record<string, string>): void {
  if (depsInstalled) return;

  const reqFile = path.join(sidecarDir, 'requirements.txt');
  if (!fs.existsSync(reqFile)) return;

  console.log('[RAG Sidecar] Installing pip dependencies...');
  // Use --user on Windows (no admin rights); omit on macOS/Linux (conda/venv may reject it)
  const args = process.platform === 'win32'
    ? ['-m', 'pip', 'install', '--user', '-q', '-r', reqFile]
    : ['-m', 'pip', 'install', '-q', '-r', reqFile];
  const result = spawnSync(pythonCmd, args, {
    cwd: sidecarDir,
    env,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 120_000,
  });

  if (result.status === 0) {
    console.log('[RAG Sidecar] pip dependencies installed');
    depsInstalled = true;
  } else {
    const err = (result.stderr || result.stdout || '').trim();
    console.error(`[RAG Sidecar] pip install failed (exit ${result.status}): ${err.slice(0, 500)}`);
  }
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error('Failed to get port'));
      }
    });
    server.on('error', reject);
  });
}

async function waitForHealth(port: number, timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export async function startSidecar(dbPath: string, env?: Record<string, string>): Promise<void> {
  if (sidecarProcess) return;

  const port = await findFreePort();
  sidecarPort = port;
  sidecarReady = false;

  const sidecarDir = getSidecarDir();
  const appPy = path.join(sidecarDir, 'app.py');

  const childEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    RAG_DB_PATH: dbPath,
    RAG_PORT: String(port),
    RAG_WORKING_DIR: path.join(app.getPath('userData'), 'lightrag_data'),
    ...env,
  };

  // Ensure built-in Python is in PATH on Windows
  if (process.platform === 'win32') {
    appendPythonRuntimeToEnv(childEnv);
  }

  const pythonCmd = getPythonCommand();
  console.log(`[RAG Sidecar] Python command: ${pythonCmd}`);

  // Install pip dependencies if needed (all platforms)
  try {
    ensureDeps(pythonCmd, sidecarDir, childEnv);
  } catch (e) {
    console.error('[RAG Sidecar] ensureDeps threw:', e);
  }

  const proc = spawn(pythonCmd, [appPy], {
    cwd: sidecarDir,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  sidecarProcess = proc;

  let stderr = '';
  proc.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
    // Keep only last 8KB
    if (stderr.length > 8192) stderr = stderr.slice(-8192);
  });

  proc.on('exit', (code) => {
    console.log(`[RAG Sidecar] exited with code ${code}`);
    // Only update state if this is still the active process
    if (sidecarProcess !== proc) return;
    sidecarProcess = null;
    sidecarReady = false;

    if (code !== 0 && restartCount < MAX_RESTARTS) {
      restartCount++;
      console.log(`[RAG Sidecar] restarting (${restartCount}/${MAX_RESTARTS})...`);
      startSidecar(dbPath, env).catch(console.error);
    }
  });

  const healthy = await waitForHealth(port);
  if (healthy) {
    sidecarReady = true;
    restartCount = 0;
    console.log(`[RAG Sidecar] ready on port ${port}`);
  } else {
    console.error(`[RAG Sidecar] failed to start. stderr: ${stderr}`);
    stopSidecar();
  }
}

export function stopSidecar(): void {
  if (sidecarProcess) {
    sidecarProcess.kill('SIGTERM');
    sidecarProcess = null;
  }
  sidecarReady = false;
  sidecarPort = 0;
}

export async function restartSidecar(dbPath: string, env?: Record<string, string>): Promise<void> {
  stopSidecar();
  restartCount = 0;
  await startSidecar(dbPath, env);
}

export function getSidecarStatus(): { running: boolean; port: number } {
  return { running: sidecarReady, port: sidecarPort };
}

export function getSidecarBaseUrl(): string | null {
  if (!sidecarReady || !sidecarPort) return null;
  return `http://127.0.0.1:${sidecarPort}`;
}

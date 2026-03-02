import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import net from 'net';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort: number = 0;
let sidecarReady = false;
let restartCount = 0;
const MAX_RESTARTS = 3;

function getSkillsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'SKILLs')
    : path.join(app.getAppPath(), 'SKILLs');
}

function getSidecarDir(): string {
  return path.join(getSkillsRoot(), 'pageindex-rag', 'sidecar');
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
    ...env,
  };

  sidecarProcess = spawn('python3', [appPy], {
    cwd: sidecarDir,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  sidecarProcess.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
    // Keep only last 8KB
    if (stderr.length > 8192) stderr = stderr.slice(-8192);
  });

  sidecarProcess.on('exit', (code) => {
    console.log(`[RAG Sidecar] exited with code ${code}`);
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

export function getSidecarStatus(): { running: boolean; port: number } {
  return { running: sidecarReady, port: sidecarPort };
}

export function getSidecarBaseUrl(): string | null {
  if (!sidecarReady || !sidecarPort) return null;
  return `http://127.0.0.1:${sidecarPort}`;
}

/**
 * Process management utilities
 */
import { ChildProcess, spawn, SpawnOptions } from "node:child_process";
import { createLogger } from "./logging.js";
import { ErrorCode, ServerError } from "./errors.js";

const logger = createLogger({ prefix: "Process" });

/**
 * Process spawn options
 */
export interface ProcessSpawnOptions extends SpawnOptions {
  command: string;
  args?: string[];
}

/**
 * Spawn a child process
 */
export function spawnProcess(options: ProcessSpawnOptions): ChildProcess {
  const { command, args = [], ...spawnOptions } = options;
  
  logger.debug(`Spawning process: ${command} ${args.join(" ")}`);
  
  try {
    const process = spawn(command, args, {
      ...spawnOptions,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    
    // Log process events
    process.on("spawn", () => {
      logger.debug(`Process spawned: ${command} (PID: ${process.pid})`);
    });
    
    process.on("error", (error) => {
      logger.error(`Process error: ${command} (PID: ${process.pid})`, error);
    });
    
    process.on("exit", (code, signal) => {
      if (code === 0) {
        logger.debug(`Process exited: ${command} (PID: ${process.pid}) with code ${code}`);
      } else {
        logger.warn(`Process exited: ${command} (PID: ${process.pid}) with code ${code}, signal ${signal}`);
      }
    });
    
    // Log stdout and stderr
    if (process.stdout) {
      process.stdout.on("data", (data) => {
        logger.debug(`[${command} stdout] ${data.toString().trim()}`);
      });
    }
    
    if (process.stderr) {
      process.stderr.on("data", (data) => {
        logger.debug(`[${command} stderr] ${data.toString().trim()}`);
      });
    }
    
    return process;
  } catch (error) {
    logger.error(`Failed to spawn process: ${command}`, error);
    throw new ServerError(
      ErrorCode.SERVER_START_FAILED,
      `Failed to spawn process: ${command}`,
      undefined,
      error
    );
  }
}

/**
 * Kill a child process gracefully
 */
export async function killProcess(process: ChildProcess, timeout = 5000): Promise<void> {
  if (!process.pid) {
    return;
  }
  
  logger.debug(`Killing process (PID: ${process.pid})`);
  
  return new Promise<void>((resolve, reject) => {
    // Set a timeout to force kill if graceful shutdown fails
    const timeoutId = setTimeout(() => {
      logger.warn(`Process (PID: ${process.pid}) did not exit gracefully, force killing`);
      process.kill("SIGKILL");
    }, timeout);
    
    // Listen for process exit
    process.once("exit", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    
    // Listen for process error
    process.once("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    
    // Send SIGTERM to gracefully terminate
    process.kill("SIGTERM");
  });
}

/**
 * Check if a process is running
 */
export function isProcessRunning(process: ChildProcess): boolean {
  return process.pid !== undefined && !process.killed;
}

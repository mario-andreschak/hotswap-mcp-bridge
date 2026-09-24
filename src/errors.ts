export class BridgeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}
export function safeError(error: unknown): { status: number; message: string } {
  return error instanceof BridgeError
    ? { status: error.status, message: error.message }
    : { status: 500, message: 'Bridge operation failed.' };
}
export async function bounded<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BridgeError(message, 504)), milliseconds);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

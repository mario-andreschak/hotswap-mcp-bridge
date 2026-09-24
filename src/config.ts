import { z } from 'zod';
import { BridgeError } from './errors.js';

const key = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/)
  .refine(value => !['__proto__', 'prototype', 'constructor'].includes(value));
export const EnvironmentSchema = z.record(key, z.string().max(8192))
  .refine(value => Object.keys(value).length <= 128 && JSON.stringify(value).length <= 262_144);
const headers = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,127}$/), z.string().max(8192).refine(value => !/[\r\n]/.test(value)))
  .refine(value => Object.keys(value).length <= 32 && Object.keys(value).every(name =>
    !['host', 'origin', 'content-length', 'connection', 'transfer-encoding', 'upgrade'].includes(name.toLowerCase()) &&
    !name.toLowerCase().startsWith('mcp-')));
const common = {
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  version: z.string().min(1).max(100).default('1.0.0'),
};
const remoteUrl = z.string().max(4096).refine(value => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
});
export const ServerSchema = z.discriminatedUnion('transport', [
  z.object({ ...common, transport: z.literal('stdio'), command: z.string().min(1).max(4096),
    args: z.array(z.string().max(8192)).max(128).default([]), cwd: z.string().max(4096).optional(),
    env: EnvironmentSchema.default({}) }).strict(),
  z.object({ ...common, transport: z.literal('http'), url: remoteUrl, headers: headers.default({}) }).strict(),
  z.object({ ...common, transport: z.literal('sse'), url: remoteUrl, headers: headers.default({}) }).strict(),
  z.object({ ...common, transport: z.literal('memory'), env: EnvironmentSchema.default({}) }).strict(),
]);
export type ServerConfig = z.output<typeof ServerSchema>;
export type ServerInput = z.input<typeof ServerSchema>;
export const ConnectionSchema = z.object({
  name: z.string().min(1).max(100).default('Connection'),
  version: z.string().min(1).max(100).default('1.0.0'),
  serverId: z.string().uuid(),
  transport: z.enum(['http', 'stdio', 'sse', 'memory']).default('http'),
}).strict();
export type ConnectionConfig = z.output<typeof ConnectionSchema>;
export type ConnectionInput = z.input<typeof ConnectionSchema>;

export function parse<T extends z.ZodType>(schema: T, value: unknown, label: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BridgeError('Invalid ' + label + '.');
  return result.data;
}
export interface Limits {
  startupMs: number; requestMs: number; drainMs: number;
  servers: number; connections: number; requestsPerServer: number;
}
export const DEFAULT_LIMITS: Limits = {
  startupMs: 10_000, requestMs: 30_000, drainMs: 5000, servers: 32, connections: 128, requestsPerServer: 64,
};
export function limits(value: Partial<Limits> = {}): Limits {
  const result = { ...DEFAULT_LIMITS, ...value };
  for (const [name, number] of Object.entries(result)) {
    const maximum = ['startupMs', 'requestMs', 'drainMs'].includes(name) ? 300_000 : 1024;
    if (!Number.isSafeInteger(number) || number < 1 || number > maximum) throw new BridgeError('Invalid bridge limits.');
  }
  return result;
}

import { createHash } from 'crypto';

function canonicalize(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const out: Record<string, any> = {};
  Object.keys(obj).sort().forEach((k) => {
    out[k] = canonicalize(obj[k]);
  });
  return out;
}

export function computeRequestHash(method: string, path: string, body: any, ownerId?: string) {
  const payload = {
    method,
    path,
    body: canonicalize(body ?? {}),
    ownerId: ownerId ?? null,
  };
  const str = JSON.stringify(payload);
  return createHash('sha256').update(str).digest('hex');
}
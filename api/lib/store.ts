import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const TMP_DIR = os.tmpdir();
const LAST_IDS_FILE = path.join(TMP_DIR, 'avisos-esjf-last-ids.json');
const PUSH_SUBS_FILE = path.join(TMP_DIR, 'avisos-esjf-push-subs.json');

// In-memory fallback (survives warm lambda)
let memoryLastIds: string[] | null = null;
let memoryPushSubs: any[] | null = null;

// Optional Upstash Redis REST (if configured on Vercel)
async function upstashGet(key: string): Promise<string | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${key}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { result: string | null };
    return data.result;
  } catch { return null; }
}

async function upstashSet(key: string, value: string): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;
  try {
    const res = await fetch(`${url}/set/${key}/${encodeURIComponent(value)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch { return false; }
}

// ---- Last IDs ----
export async function getLastSentIds(): Promise<string[]> {
  // Try Upstash first
  const upstashVal = await upstashGet('avisos:lastIds');
  if (upstashVal) {
    try { return JSON.parse(upstashVal); } catch {}
  }
  if (memoryLastIds) return memoryLastIds;
  try {
    const data = await fs.readFile(LAST_IDS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    memoryLastIds = parsed;
    return parsed;
  } catch {
    return [];
  }
}

export async function setLastSentIds(ids: string[]): Promise<void> {
  memoryLastIds = ids;
  const val = JSON.stringify(ids);
  const upstashOk = await upstashSet('avisos:lastIds', val);
  if (upstashOk) return;
  try {
    await fs.writeFile(LAST_IDS_FILE, val, 'utf-8');
  } catch {}
}

// ---- Push Subscriptions ----
export async function getPushSubscriptions(): Promise<any[]> {
  const upstashVal = await upstashGet('avisos:pushSubs');
  if (upstashVal) {
    try { return JSON.parse(upstashVal); } catch {}
  }
  if (memoryPushSubs) return memoryPushSubs;
  try {
    const data = await fs.readFile(PUSH_SUBS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    memoryPushSubs = parsed;
    return parsed;
  } catch {
    return [];
  }
}

export async function addPushSubscription(sub: any): Promise<void> {
  const subs = await getPushSubscriptions();
  // Deduplicate by endpoint
  const filtered = subs.filter((s: any) => s.endpoint !== sub.endpoint);
  filtered.push(sub);
  memoryPushSubs = filtered;
  const val = JSON.stringify(filtered);
  const upstashOk = await upstashSet('avisos:pushSubs', val);
  if (upstashOk) return;
  try { await fs.writeFile(PUSH_SUBS_FILE, val, 'utf-8'); } catch {}
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const subs = await getPushSubscriptions();
  const filtered = subs.filter((s: any) => s.endpoint !== endpoint);
  memoryPushSubs = filtered;
  const val = JSON.stringify(filtered);
  const upstashOk = await upstashSet('avisos:pushSubs', val);
  if (upstashOk) return;
  try { await fs.writeFile(PUSH_SUBS_FILE, val, 'utf-8'); } catch {}
}

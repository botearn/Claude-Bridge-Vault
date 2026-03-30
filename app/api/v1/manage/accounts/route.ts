import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { encrypt, decrypt } from '@/lib/crypto';

const HASH_KEY = 'vault:accounts';

export interface AccountRecord {
  id: string;
  vendorName: string;
  apiEndpoint: string;
  websiteUrl: string;
  username: string;
  password: string;        // encrypted at rest in Redis
  notes: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
}

function genId() {
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getSession(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/* GET — list accounts for current user */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const all = await redis.hgetall<Record<string, string>>(HASH_KEY);
  if (!all) return NextResponse.json({ accounts: [] });

  const accounts: AccountRecord[] = [];
  for (const [, raw] of Object.entries(all)) {
    try {
      const rec: AccountRecord = typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as AccountRecord;
      // admin sees all, user sees own
      if (session.role === 'admin' || rec.userId === session.userId) {
        // Decrypt sensitive fields before sending to client
        rec.username = await decrypt(rec.username);
        rec.password = await decrypt(rec.password);
        accounts.push(rec);
      }
    } catch { /* skip malformed */ }
  }

  accounts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ accounts });
}

/* POST — create account record */
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { vendorName, apiEndpoint, websiteUrl, username, password, notes } = body as Partial<AccountRecord>;

  if (!vendorName?.trim()) {
    return NextResponse.json({ error: 'vendorName is required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const record: AccountRecord = {
    id: genId(),
    vendorName: vendorName.trim(),
    apiEndpoint: (apiEndpoint ?? '').trim(),
    websiteUrl: (websiteUrl ?? '').trim(),
    username: await encrypt((username ?? '').trim()),
    password: await encrypt((password ?? '').trim()),
    notes: (notes ?? '').trim(),
    createdAt: now,
    updatedAt: now,
    userId: session.userId,
  };

  await redis.hset(HASH_KEY, { [record.id]: JSON.stringify(record) });

  // Return decrypted to client
  record.username = (username ?? '').trim();
  record.password = (password ?? '').trim();
  return NextResponse.json({ account: record }, { status: 201 });
}

/* PATCH — update account record */
export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body as Partial<AccountRecord> & { id: string };

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const raw = await redis.hget<string>(HASH_KEY, id);
  if (!raw) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing: AccountRecord = typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as AccountRecord;

  if (session.role !== 'admin' && existing.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Decrypt existing values for comparison / fallback
  const existingUsername = await decrypt(existing.username);
  const existingPassword = await decrypt(existing.password);

  const plainUsername = updates.username?.trim() ?? existingUsername;
  const plainPassword = updates.password?.trim() ?? existingPassword;

  const updated: AccountRecord = {
    ...existing,
    vendorName: updates.vendorName?.trim() ?? existing.vendorName,
    apiEndpoint: updates.apiEndpoint?.trim() ?? existing.apiEndpoint,
    websiteUrl: updates.websiteUrl?.trim() ?? existing.websiteUrl,
    username: await encrypt(plainUsername),
    password: await encrypt(plainPassword),
    notes: updates.notes?.trim() ?? existing.notes,
    updatedAt: new Date().toISOString(),
  };

  await redis.hset(HASH_KEY, { [id]: JSON.stringify(updated) });

  // Return decrypted to client
  updated.username = plainUsername;
  updated.password = plainPassword;
  return NextResponse.json({ account: updated });
}

/* DELETE — remove account record */
export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const raw = await redis.hget<string>(HASH_KEY, id);
  if (!raw) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const existing: AccountRecord = typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as AccountRecord;

  if (session.role !== 'admin' && existing.userId !== session.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await redis.hdel(HASH_KEY, id);
  return NextResponse.json({ ok: true });
}

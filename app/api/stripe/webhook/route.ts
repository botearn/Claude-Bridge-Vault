import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { addBalance } from '@/lib/balance';
import { redis } from '@/lib/redis';

export const config = { api: { bodyParser: false } };

/** POST /api/stripe/webhook — Stripe sends payment events here */
export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET not set');
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  const rawBody = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('[stripe] Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { userId, email, amountUsd } = session.metadata ?? {};

    if (!userId || !amountUsd) {
      console.error('[stripe] Missing metadata in session', session.id);
      return NextResponse.json({ ok: true });
    }

    const amount = parseFloat(amountUsd);
    if (!Number.isFinite(amount) || amount <= 0) {
      console.error('[stripe] Invalid amountUsd in metadata', amountUsd);
      return NextResponse.json({ ok: true });
    }

    // Idempotency: skip if already processed
    const idempKey = `vault:stripe:processed:${session.id}`;
    const alreadyDone = await redis.get(idempKey);
    if (alreadyDone) {
      console.log(`[stripe] Duplicate webhook for session ${session.id}, skipping`);
      return NextResponse.json({ ok: true });
    }

    const newBalance = await addBalance(userId, amount);
    await redis.set(idempKey, '1', { ex: 90 * 24 * 3600 }); // 90-day idempotency window

    // Write top-up log
    const log = {
      operatorId: 'stripe',
      operatorEmail: 'stripe',
      targetUserId: userId,
      targetEmail: email ?? '',
      amountUsd: amount,
      newBalance,
      source: 'stripe',
      stripeSessionId: session.id,
      timestamp: new Date().toISOString(),
    };
    await redis.lpush('vault:topup:logs', JSON.stringify(log));
    await redis.ltrim('vault:topup:logs', 0, 999);

    console.log(`[stripe] ✓ Credited $${amount} to user ${userId} (${email}), new balance: $${newBalance}`);
  }

  return NextResponse.json({ ok: true });
}

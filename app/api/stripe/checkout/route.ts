import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth';
import { stripe } from '@/lib/stripe';

/** POST /api/stripe/checkout
 * Body: { amountUsd: number }
 * Returns: { url: string } — Stripe Checkout URL
 */
export async function POST(req: NextRequest) {
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const session = await verifySessionToken(token);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const amountUsd = typeof body?.amountUsd === 'number' ? body.amountUsd : 0;

  if (amountUsd < 1 || amountUsd > 10000) {
    return NextResponse.json({ error: 'Amount must be between $1 and $10,000' }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `https://${req.headers.get('host')}`;

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `API Credits — $${amountUsd}`,
            description: `Add $${amountUsd} to your Token Bank balance`,
          },
          unit_amount: Math.round(amountUsd * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId: session.userId,
      email: session.email,
      amountUsd: String(amountUsd),
    },
    customer_email: session.email,
    success_url: `${baseUrl}/vault?payment=success`,
    cancel_url: `${baseUrl}/vault?payment=cancelled`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}

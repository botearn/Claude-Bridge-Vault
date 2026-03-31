import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — Stripe payments will be unavailable');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

/** Credit amounts available for purchase (USD) */
export const CREDIT_PACKAGES = [
  { label: '$5', amountUsd: 5, stripePriceCents: 500 },
  { label: '$10', amountUsd: 10, stripePriceCents: 1000 },
  { label: '$20', amountUsd: 20, stripePriceCents: 2000 },
  { label: '$50', amountUsd: 50, stripePriceCents: 5000 },
  { label: '$100', amountUsd: 100, stripePriceCents: 10000 },
];

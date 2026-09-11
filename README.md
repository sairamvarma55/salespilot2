# SalesPilot AI v0.2

A small SaaS MVP for generating sales follow-ups, saving leads, and starting Stripe subscriptions.

## Run locally
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Add `OPENAI_API_KEY` for live AI generation. Without it, the app runs in demo mode.
4. Add `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` when you are ready to accept subscriptions.
5. Run `npm install` then `npm start`.
6. Open http://localhost:3000.

## Production notes
- Use HTTPS and a strong SESSION_SECRET.
- Set secure cookies behind HTTPS.
- Put the app behind a reverse proxy.
- Add a persistent session store for multi-instance deployment.
- Add Stripe webhook handling before treating a user as paid.
- Replace the demo subscription flow with verified subscription state and usage limits.
- Add email verification, password reset, rate limiting, abuse controls, privacy policy and terms before public launch.

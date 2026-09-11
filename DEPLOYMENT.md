# SalesPilot AI — v0.3 launch checklist

## Before launch
1. Create production PostgreSQL database.
2. Configure environment variables from `server/README.md`.
3. Connect OpenAI Responses API on the server only (never expose API keys in browser code).
4. Create Stripe Product + recurring Price and configure webhook endpoint.
5. Enforce Free/Pro usage limits server-side.
6. Add secure password hashing, sessions/cookies, CSRF protection, validation and rate limiting.
7. Add Privacy Policy and Terms of Service.
8. Test signup → lead → AI generation → checkout → webhook → Pro entitlement.
9. Deploy API and frontend.
10. Run a small beta with real salespeople before paid acquisition.

## Revenue target
$3,000/month is approximately $100/day average.
At $19/month, about 159 active Pro subscribers are needed for $3,000/month before fees, refunds and taxes.

## Important
Revenue is not guaranteed. Validate willingness to pay with a small beta before spending significantly on advertising.

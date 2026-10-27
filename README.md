# Budget Buddy

Budget Buddy is a personal expense tracking app for managing spending, categorizing transactions, and reviewing cash flow from a simple mobile-friendly interface.

## What it does

- Add spending categories manually or by voice
- Record transactions by typing or speaking in English or Hindi
- Automatically suggest categories using AI-powered matching
- Review parsed transaction details before saving
- Track money in and out across people, shops, and categories
- Use a Supabase-backed backend for authentication, storage, and serverless AI functions
- Run as a web app and package as an Android app with Capacitor

## Core features

### Smart category matching

Categories are chosen in tiers. Each tier runs only if the one before it wasn't sure:

1. **History**: the party name (e.g. "Swiggy") is embedded and compared with your own past, categorised transactions (pgvector). The nearest ones vote on the category, weighted by similarity. No AI call.
2. **Category names**: the nearest category names by vector similarity. Covers the cold start, when there's little history. No AI call.
3. **AI (Groq)**: picks from a shortlist, shown a few similar past transactions as examples. It can also suggest a new category.

Every result is still shown for review before saving, and every saved transaction becomes history for next time. Embeddings use Supabase's built-in `gte-small` model (no API key). They're written in the background by the `categorize` function's `sync` action, which the app runs after each save. Run migration `006_transaction_vectors.sql` to enable the history tier. Without it, the app falls back to the other tiers.

Optional function secrets for tuning (similarity is cosine, 0 to 1):

| Secret | Default | Meaning |
| --- | --- | --- |
| `CATEGORIZE_HISTORY_MIN_SIM` | `0.92` | Closest past transaction must be at least this similar |
| `CATEGORIZE_HISTORY_MIN_SHARE` | `0.7` | Winning category's share of the weighted votes |
| `CATEGORIZE_NEIGHBOUR_FLOOR` | `0.85` | Past transactions below this similarity are ignored |
| `CATEGORIZE_DIRECT_THRESHOLD` / `CATEGORIZE_DIRECT_MARGIN` | `0.92` / `0.03` | Category-name tier |


### Mode of payment

Every transaction has a mode of payment from the `payment_modes` table: UPI, Cash, Card, Net Banking, Wallet or Cheque. Say it in the note, e.g. *"13 sep Blinkit 300 cash"*, and it is saved as Cash. If the note says nothing, or names something that isn't in the list, it is saved as **UPI**. You can change it in the review step before saving. The dashboard's **By mode of payment** chart and table show how much was debited and credited through each mode for the selected dates.

Run migration `007_payment_modes.sql` (existing transactions become UPI), then redeploy the `parse-transaction` function.

### Multi-transaction notes

A single note can include several transactions at once, such as multiple expenses for different people or vendors. The app breaks them into individual review cards and saves them together as one batch.

### Family invitations

Family invitations need migrations `008_family_structure.sql` and `009_family_invitation_acceptance.sql`, plus the `family-invite` Edge Function. Apply pending migrations with `supabase db push`, then deploy the function with `supabase functions deploy family-invite`.

Set these Supabase Edge Function secrets before sending invites:

| Secret | Value |
| --- | --- |
| `SENDGRID_API_KEY` | SendGrid API key with Mail Send permission |
| `FAMILY_INVITE_FROM` | Verified SendGrid sender address, such as `Budget Buddy <invites@example.com>` |
| `APP_SITE_URL` | Public origin of the app, such as `https://budget.example.com` |

Verify the sender identity or domain in SendGrid before sending. The recipient must sign in or create an account with the invited email address. If email confirmation is enabled, the confirmation link returns them to the family invitation so they can accept it.

## Tech stack

- React + Vite for the frontend
- Capacitor for Android packaging
- Supabase for authentication and database storage
- Edge functions for AI parsing and categorization
- Groq for speech-to-text and AI-assisted classification

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown in the terminal.

## Android

```bash
npm run android:sync
npm run android:open
```

This opens Android Studio so you can run the app on an emulator or connected device.

## Notes

- The project is built for personal finance tracking and quick transaction entry.
- Voice input and AI categorization rely on the configured Supabase/Groq backend.
- The app is designed to be simple, fast, and usable from both web and mobile contexts.

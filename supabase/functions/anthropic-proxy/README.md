# Anthropic Proxy

This Edge Function keeps the Anthropic API key out of the Expo app bundle.

Set or rotate the key without rebuilding the app:

```bash
supabase login
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-key-here
supabase functions deploy anthropic-proxy
```

Or sync all supported server-side keys from the local `.env` file:

```bash
npm run secrets:sync -- --apply
```

The mobile app calls this function through the Supabase anon key, which can stay in `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

# Supabase Database Security Guide

Since you're using `SERVICE_ROLE_KEY` (which bypasses Row Level Security), here's how to secure your database:

## 🔐 Key Security Principles

1. **SERVICE_ROLE_KEY is a master key** - it bypasses all RLS policies
2. **Never expose SERVICE_ROLE_KEY** - keep it in server-side environment variables only
3. **Enable RLS as defense in depth** - even though SERVICE_ROLE bypasses it
4. **Keep ANON_KEY separate** - if you ever need client-side access

## ✅ Security Checklist

### 1. Environment Variables (Most Important!)

- ✅ **Keep `SUPABASE_SERVICE_ROLE_KEY` secret** - Never commit to git
- ✅ **Only use in server-side code** - Your `app/lib/supabase.server.js` is correct
- ✅ **Store in Railway env vars** - Not in client-side code
- ✅ **Rotate keys periodically** - In Supabase dashboard → Settings → API

### 2. Enable Row Level Security (RLS)

Even though SERVICE_ROLE bypasses RLS, enable it as defense in depth:

```sql
-- Enable RLS on all tables
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_voice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_product_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
```

**Note**: With SERVICE_ROLE_KEY, these policies won't affect your app, but they protect against:
- Accidental use of ANON_KEY
- Future API endpoints that might use ANON_KEY
- Direct database access attempts

### 3. Create RLS Policies (Optional but Recommended)

If you want to add policies for defense in depth:

```sql
-- Example: Only service role can access (restrictive policy)
-- This ensures if ANON_KEY is ever used, it can't access data

-- Shops table
CREATE POLICY "Service role only" ON public.shops
  FOR ALL
  USING (auth.role() = 'service_role');

-- Repeat for other tables...
```

Or more permissive if you want to allow ANON_KEY for specific operations:

```sql
-- Allow service role full access, anon key can only read public data
CREATE POLICY "Service role full access" ON public.shops
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Public read shops" ON public.shops
  FOR SELECT
  USING (true); -- Or add your conditions
```

### 4. Supabase Dashboard Settings

In your Supabase Dashboard → Settings → API:

- ✅ **Note your PROJECT_URL** - Keep it in env vars
- ✅ **Note your SERVICE_ROLE_KEY** - Store securely
- ✅ **Keep ANON_KEY separate** - Don't use it in server code
- ✅ **Enable API Rate Limiting** - Protect against abuse

### 5. Network Security (If Available)

Supabase has some network security features:

- **IP Restrictions** (Pro plan+) - Restrict API access to specific IPs
- **Connection Pooling** - Use Supabase connection pooler URL (recommended for production)

### 6. Connection Pooling (Recommended for Production)

Instead of direct connection, use connection pooling:

```
# Instead of:
SUPABASE_URL=https://xxx.supabase.co

# Use pooler (recommended for server-side):
SUPABASE_URL=https://xxx.supabase.co:6543
# Or transaction pooler:
SUPABASE_URL=https://xxx.supabase.co:5432
```

Update your `app/lib/supabase.server.js` to use the pooler URL.

### 7. Regular Security Practices

- ✅ **Rotate SERVICE_ROLE_KEY quarterly** - Generate new key, update env vars
- ✅ **Monitor access logs** - Supabase Dashboard → Logs
- ✅ **Keep Supabase updated** - They handle infrastructure updates
- ✅ **Use strong passwords** - For Supabase account itself
- ✅ **Enable 2FA** - On your Supabase account

## 🚨 What NOT to Do

- ❌ Never expose SERVICE_ROLE_KEY in client-side code
- ❌ Never commit SERVICE_ROLE_KEY to git
- ❌ Never log SERVICE_ROLE_KEY in console/logs
- ❌ Never share SERVICE_ROLE_KEY in screenshots/docs
- ❌ Don't use SERVICE_ROLE_KEY for client-side operations
- ❌ Don't disable RLS without understanding the implications

## 📝 Current Setup Status

Your current setup is **GOOD**:
- ✅ Using SERVICE_ROLE_KEY in server-side only (`app/lib/supabase.server.js`)
- ✅ Storing keys in environment variables
- ✅ Server-side file (`.server.js` extension)

## 🔧 Quick Setup Script

Run this SQL in Supabase SQL Editor to enable RLS on all tables:

```sql
-- Enable RLS on all tables
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_voice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_product_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
```

## 🎯 Summary

Since you're using SERVICE_ROLE_KEY server-side:
1. **Your database is already secure** - as long as SERVICE_ROLE_KEY stays secret
2. **Enable RLS** - for defense in depth (run the SQL above)
3. **Keep env vars secure** - Never expose SERVICE_ROLE_KEY
4. **Monitor access** - Check Supabase logs regularly

Your database is "published" (accessible via API) but protected by:
- Secret SERVICE_ROLE_KEY
- Server-side only access
- Environment variable security





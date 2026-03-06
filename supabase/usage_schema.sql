CREATE TABLE public.user_usages (
  email TEXT PRIMARY KEY,
  used_seconds INTEGER NOT NULL DEFAULT 0,
  total_allowed_seconds INTEGER NOT NULL DEFAULT 180
);

-- Enable RLS (Row Level Security) if you want to allow clients to securely read their own quota
-- However, since the Next.js API route uses the SUPABASE_SERVICE_ROLE_KEY, it bypasses RLS automatically.
-- For safety, you should probably enforce basic protections if clients ever query directly.
ALTER TABLE public.user_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usages."
ON public.user_usages FOR SELECT
TO authenticated
USING (auth.jwt() ->> 'email' = email);

-- Create the user_usages table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_usages (
    email TEXT PRIMARY KEY,
    used_seconds INTEGER NOT NULL DEFAULT 0,
    total_allowed_seconds INTEGER NOT NULL DEFAULT 180, -- 3 minutes free tier
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on Row Level Security
ALTER TABLE public.user_usages ENABLE ROW LEVEL SECURITY;

-- Allow users to read only their own usage row
CREATE POLICY "Users can view their own usage" 
ON public.user_usages FOR SELECT 
USING ( email = current_user );

-- (For simplicity in the Next.js API running with service role, the API will bypass RLS.
-- So we only need to provide basic SELCT for the authenticated users if they query from client,
-- though Next.js proxy approaches won't strictly need client-level RLS to function securely).

-- Trigger to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_usages_updated_at ON public.user_usages;
CREATE TRIGGER trg_user_usages_updated_at
BEFORE UPDATE ON public.user_usages
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add a CASCADE rule or trigger to clean up dormant rooms when host logs off
ALTER TABLE public.rooms 
ADD COLUMN IF NOT EXISTS last_ping_at TIMESTAMPTZ DEFAULT NOW();
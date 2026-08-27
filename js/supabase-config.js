// Public browser credentials only. Never place a Supabase secret/service-role key here.
export const SUPABASE_URL = 'https://feivtfezpblvztchjzhh.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlaXZ0ZmV6cGJsdnp0Y2hqemhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4NTE0NTYsImV4cCI6MjEwMzQyNzQ1Nn0.CCVhtNPxP1uBS6jN8y_D7mu9-6XYUPkFLyckS2DLW08';

export const syncIsConfigured = Boolean(
  SUPABASE_URL.startsWith('https://')
  && SUPABASE_PUBLISHABLE_KEY.length > 20,
);

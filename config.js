// Supabase connection. The anon key is safe to publish; access is enforced by the database rules.
window.MOBER_CONFIG = {
  SUPABASE_URL: "https://fhvqppdummbvawihnqfk.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZodnFwcGR1bW1idmF3aWhucWZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxMDM0NjgsImV4cCI6MjEwOTY3OTQ2OH0.qCKfIp7W1ZmUlFjqdZa16wForpvJv7diImGxHBfwohA",
  // Only these email domains can sign in. Keep in sync with is_staff() in supabase/schema.sql.
  ALLOWED_DOMAINS: ["mober.ph"],
};

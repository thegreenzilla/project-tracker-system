// Fill these two values from Supabase: Project Settings → API.
// The anon key is safe to publish; access is enforced by the database rules.
window.MOBER_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",
  // Only these email domains can sign in. Keep in sync with is_staff() in supabase/schema.sql.
  ALLOWED_DOMAINS: ["mober.ph"],
};

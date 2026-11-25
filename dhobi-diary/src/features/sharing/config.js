// Family sharing backend: Supabase (free plan is enough).
// Paste your project's values from: Supabase dashboard → Project Settings → API (Data API)
//   supabaseUrl     = "Project URL"           e.g. https://abcdxyz.supabase.co
//   supabaseAnonKey = "anon public" key       (safe to ship in the app: the database rules protect the data)
// Full steps: README.md → "Family diary setup (Supabase)".
// Leave as null to ship without family sharing; the app works fully offline either way.
export const supabaseUrl = null;
export const supabaseAnonKey = null;

export const familyAvailable = () => !!(supabaseUrl && supabaseAnonKey);

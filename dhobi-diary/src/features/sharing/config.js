// Family sharing backend: Supabase (free plan is enough).
// Paste your project's values from: Supabase dashboard → Project Settings → API (Data API)
//   supabaseUrl     = "Project URL"           e.g. https://abcdxyz.supabase.co
//   supabaseAnonKey = "anon public" key       (safe to ship in the app: the database rules protect the data)
// Full steps: README.md → "Family diary setup (Supabase)".
// Leave as null to ship without family sharing; the app works fully offline either way.
export const supabaseUrl = 'https://jlwdcolcjqlafattebcr.supabase.co';
export const supabaseAnonKey = 'sb_publishable_dIjTB5oLCNUffdCYSUZq4A_RSKrTjED'; // publishable (public) key

export const familyAvailable = () => !!(supabaseUrl && supabaseAnonKey);

// Family seats: first person free, ₹19 (one time) for each extra person.
// Phone apps pay through RevenueCat (Play Store / App Store billing). Paste the public SDK keys from
// RevenueCat → Project → API keys. The website pays through Razorpay (set razorpayEnabled once the
// razorpay-order / razorpay-webhook functions and their secrets are set up in Supabase).
export const revenueCatKeys = { android: null, ios: null }; // 'goog_…', 'appl_…'
export const razorpayEnabled = false;
export const SEAT_PRICE = 19;

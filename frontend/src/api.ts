// In production, an unset VITE_API_URL previously silently fell back to
// `http://localhost:8000` — meaning a deployed build would ship requests to
// whatever was listening on the user's own machine on port 8000 (or fail
// with `ERR_CONNECTION_REFUSED`, leaking that we expected a local backend).
// Fail loudly at module load so missing config is caught on boot, not after
// the first user hits "analyze". Dev keeps the localhost default.
const envUrl = import.meta.env.VITE_API_URL as string | undefined;

function resolveBaseUrl(): string {
  if (envUrl && envUrl.trim()) return envUrl.trim();
  if (import.meta.env.PROD) {
    throw new Error(
      "VITE_API_URL is not set. Production builds must be built with VITE_API_URL pointing at the API backend (e.g. https://api.example.com).",
    );
  }
  return "http://localhost:8000";
}

export const BASE_URL = resolveBaseUrl();

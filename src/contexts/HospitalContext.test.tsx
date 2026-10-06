import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { HospitalProvider } from "@/contexts/HospitalContext";
import { useHospitalContext } from "@/hooks/useHospitalContext";

// Settings › Staff Members writes `users.is_active`. This is the actual runtime gate:
// deactivating a staff member must sign them out and clear their session identity, not
// just hide a UI toggle. See CLAUDE.md's own comment trail on this exact regression.

let mockUsersRow: any = { id: "app-user-1", hospital_id: "hosp-a", role: "nurse", full_name: "Test Nurse", is_active: true };
let mockSession: any = { user: { id: "auth-uid-1" } };
const signOutMock = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: mockSession } })),
      getUser: vi.fn(() => Promise.resolve({ data: { user: mockSession?.user ?? null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: (...args: any[]) => signOutMock(...args),
    },
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(() => {
          if (table === "users") return Promise.resolve({ data: mockUsersRow, error: null });
          if (table === "role_permissions") return Promise.resolve({ data: { permissions: {} }, error: null });
          if (table === "hospital_subscriptions") return Promise.resolve({ data: null, error: null });
          if (table === "user_permission_overrides") return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: null, error: null });
        }),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      };
      // hospital_module_entitlements / hospital_addons resolve via bare .eq() (no maybeSingle)
      if (table === "hospital_module_entitlements" || table === "hospital_addons") {
        chain.eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
      }
      return chain;
    }),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

function Probe() {
  const ctx = useHospitalContext();
  if (ctx.loading) return <div>loading</div>;
  if (!ctx.hospitalId) return <div>signed-out</div>;
  return <div>role:{ctx.role}</div>;
}

beforeEach(() => {
  signOutMock.mockClear();
  sessionStorage.clear();
  mockSession = { user: { id: "auth-uid-1" } };
});

describe("HospitalProvider — is_active deactivation gate (Settings › Staff Members)", () => {
  it("an active staff member resolves their identity normally", async () => {
    mockUsersRow = { id: "app-user-1", hospital_id: "hosp-a", role: "nurse", full_name: "Test Nurse", is_active: true };
    render(<HospitalProvider><Probe /></HospitalProvider>);
    await waitFor(() => expect(screen.getByText("role:nurse")).toBeInTheDocument());
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("a deactivated staff member (is_active: false) is signed out and never resolves an identity", async () => {
    mockUsersRow = { id: "app-user-1", hospital_id: "hosp-a", role: "nurse", full_name: "Test Nurse", is_active: false };
    render(<HospitalProvider><Probe /></HospitalProvider>);
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
    expect(screen.queryByText(/^role:/)).not.toBeInTheDocument();
  });

  it("toggling the same user from active to inactive changes the resolved outcome — the setting genuinely drives behaviour", async () => {
    mockUsersRow = { id: "app-user-1", hospital_id: "hosp-a", role: "doctor", full_name: "Dr A", is_active: true };
    const { unmount } = render(<HospitalProvider><Probe /></HospitalProvider>);
    await waitFor(() => expect(screen.getByText("role:doctor")).toBeInTheDocument());
    unmount();

    mockUsersRow = { ...mockUsersRow, is_active: false };
    render(<HospitalProvider><Probe /></HospitalProvider>);
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
  });
});

// Found live, 2026-09-18 (Post-8B round 2): a transient network failure on getSession()/
// getUser() — confirmed via direct testing to resolve as { error: { name:
// "AuthRetryableFetchError" } } rather than throw — permanently stranded the page on
// `hospitalId: null` with no retry, no toast, no recovery short of a manual reload. The SDK
// names this error class "retryable" specifically to signal the caller should retry; neither
// call did. Regression test for the fix: one retry after a short delay, only for this named
// error class.
describe("HospitalProvider — recovers from a transient (retryable) auth-fetch failure", () => {
  it("a getUser() call that fails once with AuthRetryableFetchError still resolves identity on retry", async () => {
    mockUsersRow = { id: "app-user-1", hospital_id: "hosp-a", role: "nurse", full_name: "Test Nurse", is_active: true };
    const { supabase } = await import("@/integrations/supabase/client");
    let calls = 0;
    (supabase.auth.getUser as any).mockImplementation(() => {
      calls++;
      if (calls === 1) {
        return Promise.resolve({
          data: { user: null },
          error: { name: "AuthRetryableFetchError", message: "Failed to fetch" },
        });
      }
      return Promise.resolve({ data: { user: mockSession.user }, error: null });
    });

    render(<HospitalProvider><Probe /></HospitalProvider>);
    await waitFor(() => expect(screen.getByText("role:nurse")).toBeInTheDocument(), { timeout: 3000 });
    expect(calls).toBe(2);
  });

  it("a genuine (non-retryable) auth error does NOT retry and fails closed", async () => {
    mockUsersRow = { id: "app-user-1", hospital_id: "hosp-a", role: "nurse", full_name: "Test Nurse", is_active: true };
    const { supabase } = await import("@/integrations/supabase/client");
    let calls = 0;
    (supabase.auth.getUser as any).mockImplementation(() => {
      calls++;
      return Promise.resolve({
        data: { user: null },
        error: { name: "AuthApiError", message: "Invalid token" },
      });
    });

    render(<HospitalProvider><Probe /></HospitalProvider>);
    await waitFor(() => expect(screen.queryByText("loading")).not.toBeInTheDocument());
    expect(screen.queryByText(/^role:/)).not.toBeInTheDocument();
    // Only one call — a genuine auth failure must not be retried, or a truly invalid/expired
    // session would silently retry on every mount instead of failing closed immediately.
    expect(calls).toBe(1);
  });
});

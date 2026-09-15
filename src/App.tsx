import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { MsalProvider, useMsal } from "@azure/msal-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { msalInstance } from "@/lib/msal";
import { AuthGate } from "@/components/AuthGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ScrollToTop } from "@/components/ScrollToTop";
import { UpdateBar } from "@/components/UpdateBar";
import { usePrayerStore } from "@/lib/prayer-store";
import Browse from "./pages/Browse.tsx";
import Detail from "./pages/Detail.tsx";
import Edit from "./pages/Edit.tsx";
import Archive from "./pages/Archive.tsx";
import People from "./pages/People.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const SignedInBoot = ({ children }: { children: React.ReactNode }) => {
  const { accounts } = useMsal();
  const setIdentity = usePrayerStore((s) => s.setIdentity);
  const load = usePrayerStore((s) => s.load);
  const loaded = usePrayerStore((s) => s.loaded);

  useEffect(() => {
    const a = accounts[0];
    if (!a) return;
    setIdentity(a.name ?? a.username, a.username);
    if (!loaded) {
      load().catch(() => {
        /* surfaced via store.error */
      });
    }
  }, [accounts, setIdentity, load, loaded]);

  return <>{children}</>;
};

const App = () => (
  <MsalProvider instance={msalInstance}>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        {/* Outside the router and the auth gate: an update is offered even on
            the sign-in screen, which is where a stale copy usually sits. */}
        <UpdateBar />
        <HashRouter>
          <ScrollToTop />
          <ErrorBoundary>
            <AuthGate>
              <SignedInBoot>
                <Routes>
                  <Route path="/" element={<Browse />} />
                  <Route path="/archive" element={<Archive />} />
                  <Route path="/people" element={<People />} />
                  <Route path="/request/new" element={<Edit />} />
                  <Route path="/request/:id" element={<Detail />} />
                  <Route path="/request/:id/edit" element={<Edit />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </SignedInBoot>
            </AuthGate>
          </ErrorBoundary>
        </HashRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </MsalProvider>
);

export default App;

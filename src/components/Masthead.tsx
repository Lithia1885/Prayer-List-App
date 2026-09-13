import { Link, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { useMsal } from "@azure/msal-react";
import { TextSizeControl } from "@/components/TextSizeControl";

export const Masthead = () => {
  const { pathname } = useLocation();
  const { instance, accounts } = useMsal();
  const today = format(new Date(), "EEEE, MMMM d, yyyy");
  const account = accounts[0];

  const onSignOut = () => {
    instance.logoutPopup({ postLogoutRedirectUri: window.location.origin }).catch(() => {
      /* user dismissed */
    });
  };

  return (
    <header className="border-t-4 border-t-brand border-b border-b-hairline bg-background">
      <div className="container-wide pt-5 pb-2 sm:pt-6">
        {/* The app's name, whose it is, today's date. The church's wordmark is
            a second lockup of letterforms — next to a Caslon title it reads as
            clutter, so it stays on the sign-in screen, where it has room, and
            here the church is named in plain small caps. */}
        <div className="text-center sm:text-left sm:flex sm:items-baseline sm:justify-between sm:gap-6">
          <div>
            <Link
              to="/"
              className="font-display text-3xl sm:text-4xl leading-none text-brand hover:text-primary transition-colors inline-block"
            >
              The Prayer List
            </Link>
            <p className="eyebrow mt-2">Lithia Springs Methodist Church</p>
          </div>
          <p className="text-sm text-muted-foreground mt-2 sm:mt-0 tabular-nums">
            {today}
          </p>
        </div>

        <hr className="rule mt-4" />

        {/* Nav — large tap targets, stacks evenly on phone */}
        <nav className="grid grid-cols-2 sm:flex sm:items-center sm:gap-2">
          <NavLink to="/" active={pathname === "/"}>Current</NavLink>
          <NavLink to="/archive" active={pathname.startsWith("/archive")}>Archive</NavLink>
          <NavLink to="/people" active={pathname.startsWith("/people")}>People</NavLink>
          <NavLink to="/request/new" active={pathname === "/request/new"}>
            <span aria-hidden className="text-primary font-semibold mr-1">＋</span>
            <span>New</span>
          </NavLink>
          {account && (
            <button
              onClick={onSignOut}
              title={account.username}
              className="text-sm py-3 sm:py-2 px-2 sm:px-4 min-h-[48px] flex items-center justify-center sm:justify-start sm:ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="hidden sm:inline mr-2">{account.name ?? account.username}</span>
              <span>Sign out</span>
            </button>
          )}
        </nav>

        {/* Text size control — iOS Dynamic Type doesn't reach explicit web
            font-sizes, so the app offers its own. */}
        <div className="flex items-center justify-end gap-3 pt-1 pb-1 -mt-1 sm:mt-0">
          <span className="eyebrow">Text size</span>
          <TextSizeControl />
        </div>
      </div>
    </header>
  );
};

const NavLink = ({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) => (
  <Link
    to={to}
    aria-current={active ? "page" : undefined}
    className={`text-base sm:text-sm py-3 sm:py-2 px-2 sm:px-4 min-h-[48px] flex items-center justify-center sm:justify-start border-b-2 transition-colors ${
      active
        ? "border-accent text-foreground font-semibold"
        : "border-transparent text-muted-foreground hover:text-foreground hover:border-hairline"
    }`}
  >
    {children}
  </Link>
);

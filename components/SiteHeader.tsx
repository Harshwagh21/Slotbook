import Link from "next/link";

/** Top nav: brand link, demo, and host login. */
export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="Slotbook home">
          Slotbook
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/demo/intro-call">Demo</Link>
          <Link href="/login" className="btn btn--primary">
            Host login
          </Link>
        </nav>
      </div>
    </header>
  );
}

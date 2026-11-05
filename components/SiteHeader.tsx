import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="brand" aria-label="Slotbook home">
          <span className="brand__mark" aria-hidden="true" />
          Slotbook
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <Link href="/#how">How it works</Link>
          <Link href="/demo/intro-call">Demo</Link>
          <Link href="/login" className="btn btn--ghost">
            Host login
          </Link>
          <Link href="/login" className="btn btn--primary">
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}

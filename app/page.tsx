import Link from "next/link";

/** Landing page: brand, one-line pitch, and links to login / demo. */
export default function Home() {
  return (
    <div className="landing">
      <section className="hero">
        <h1 className="hero__brand anim-rise">
          Slot<span>book</span>
        </h1>
        <p className="hero__lead anim-rise-delay">
          Publish when you are free. Guests pick a slot.
        </p>
        <div className="hero__actions anim-rise-delay-2">
          <Link href="/login" className="btn btn--primary">
            Host login
          </Link>
          <Link href="/demo/intro-call" className="btn btn--ghost">
            Try demo
          </Link>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";

export default function Home() {
  return (
    <div className="landing">
      <section className="hero">
        <h1 className="hero__brand anim-rise">
          Slot<span>book</span>
        </h1>
        <p className="hero__lead anim-rise-delay">
          Publish when you are free. Guests pick a slot. Holds, capacity, and
          private manage links stay out of the way so bookings just land.
        </p>
        <div className="hero__actions anim-rise-delay-2">
          <Link href="/login" className="btn btn--primary">
            Start for free
          </Link>
          <Link href="/demo/intro-call" className="btn btn--ghost">
            Try a demo booking
          </Link>
        </div>
      </section>

      <div className="trust-strip">
        <div className="trust-strip__inner">
          <strong>Built for hosts</strong>
          <span>1:1 calls</span>
          <span>Group workshops</span>
          <span>Timezone-aware</span>
          <span>Self-serve reschedule</span>
        </div>
      </div>

      <section className="section" id="how">
        <div className="section__head">
          <h2>Click, click, booked.</h2>
          <p>Three steps from empty calendar to a confirmed meeting.</p>
        </div>
        <div className="steps">
          <article className="step">
            <span className="step__n">01</span>
            <h3>Create an event type</h3>
            <p>Set duration, capacity, buffers, notice windows, and a public slug.</p>
          </article>
          <article className="step">
            <span className="step__n">02</span>
            <h3>Publish your hours</h3>
            <p>Weekly windows plus date overrides. Guests only see what is actually free.</p>
          </article>
          <article className="step">
            <span className="step__n">03</span>
            <h3>Guests book themselves</h3>
            <p>They hold a slot, confirm details, and get a private link to manage it.</p>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <h2>Infrastructure for the booking itself</h2>
          <p>Sharp controls for hosts. Simple path for guests. No dashboard theater.</p>
        </div>
        <div className="feature-grid">
          <article className="feature">
            <h3>Hard holds</h3>
            <p>A five-minute hold keeps double-booking out while the guest confirms.</p>
          </article>
          <article className="feature">
            <h3>Group capacity</h3>
            <p>Run workshops with remaining seats visible on every open slot.</p>
          </article>
          <article className="feature">
            <h3>Timezone honesty</h3>
            <p>Hosts set a home zone. Guests book in theirs. Times stay unambiguous.</p>
          </article>
          <article className="feature">
            <h3>Private manage links</h3>
            <p>Reschedule or cancel without accounts, passwords, or support tickets.</p>
          </article>
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2>Start building your calendar</h2>
          <p>Zero setup theater. Log in as a host or book against the demo pages.</p>
        </div>
        <div className="hero__actions">
          <Link href="/login" className="btn btn--primary">
            Host login
          </Link>
          <Link href="/demo/group-workshop" className="btn btn--ghost">
            Group demo
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__inner">
          <span>Slotbook</span>
          <span>Hosts publish free time. Guests take a slot.</span>
        </div>
      </footer>
    </div>
  );
}

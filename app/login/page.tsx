"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData) {
    const r = await api("/api/host/login", {
      method: "POST",
      body: { email: form.get("email"), password: form.get("password") },
    });
    if (r.ok) router.push("/dashboard");
    else setError(r.data.error?.message ?? "Login failed");
  }

  return (
    <main className="app-shell">
      <div className="auth-wrap">
        <section className="panel">
          <p className="badge">Host access</p>
          <h1>Log in</h1>
          <p className="muted">Demo: demo@slotbook.dev / demo1234</p>
          <form action={submit}>
            <label>
              Email
              <input name="email" type="email" placeholder="you@company.com" required defaultValue="demo@slotbook.dev" />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="Password" required />
            </label>
            <button type="submit" className="primary">
              Log in
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          <p className="muted" style={{ marginTop: "1rem", marginBottom: 0 }}>
            Or try a <Link href="/demo/intro-call">public booking page</Link>.
          </p>
        </section>
      </div>
    </main>
  );
}

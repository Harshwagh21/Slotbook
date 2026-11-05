"use client";

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
    <section>
      <h1>Host login</h1>
      <p className="muted">Demo: demo@slotbook.dev / demo1234</p>
      <form action={submit}>
        <div className="row">
          <input name="email" type="email" placeholder="Email" required defaultValue="demo@slotbook.dev" />
          <input name="password" type="password" placeholder="Password" required />
          <button type="submit">Log in</button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

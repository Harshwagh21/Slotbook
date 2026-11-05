import Link from "next/link";

export default function Home() {
  return (
    <>
      <h1>Slotbook</h1>
      <p>Hosts publish when they are free, guests book a slot.</p>
      <ul>
        <li><Link href="/login">Host login</Link></li>
        <li><Link href="/demo/intro-call">Demo booking page: intro call (1:1)</Link></li>
        <li><Link href="/demo/group-workshop">Demo booking page: group workshop</Link></li>
      </ul>
    </>
  );
}

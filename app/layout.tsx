import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "Slotbook" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

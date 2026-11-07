import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCC Bar Schedule",
  description: "DCC bartending, sales, and inventory application",
  applicationName: "DCC Bar Schedule",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/Barsheet%20sign%20up.png", type: "image/png" }],
    shortcut: "/Barsheet%20sign%20up.png",
    apple: [{ url: "/Barsheet%20sign%20up.png", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { QueryClientProvider } from "./QueryClientProvider";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Event Planning App",
  description: "Plan your events together",
  manifest: "/manifest.json",
  themeColor: [
    {
      media: "(prefers-color-scheme: light)",
      color: "#f4f5fb",
    },
    {
      media: "(prefers-color-scheme: dark)",
      color: "#0c1024",
    },
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta
          httpEquiv="Content-Type"
          content="text/html; charset=utf-8"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta
          name="theme-color"
          content="#f4f5fb"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#0c1024"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body className={inter.className}>
        <div className="app-animated-bg" aria-hidden="true" />
        <QueryClientProvider>{children}</QueryClientProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { QueryClientProvider } from "./QueryClientProvider";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Event Planning App",
  description: "Plan your events together",
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
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
      </head>
      <body className={inter.className}>
        <QueryClientProvider>{children}</QueryClientProvider>
      </body>
    </html>
  );
}

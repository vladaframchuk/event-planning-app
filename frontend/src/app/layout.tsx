// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryClient, QueryClientProvider } from './QueryClientProvider';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Event Planning App",
  description: "Plan your events together",
};

// Создаем клиент для React Query
const makeQueryClient = () => new QueryClient();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <QueryClientProvider>{children}</QueryClientProvider>
      </body>
    </html>
  );
}
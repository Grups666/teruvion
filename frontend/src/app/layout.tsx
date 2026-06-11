import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Teruvion - Digital Earth Intelligence",
  description: "Transform research sources into living, explorable Earth object graphs",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIWN+9UMqBwF3kLdFZx5j6w5cF5J5K5E5E5E="
          crossOrigin=""
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}

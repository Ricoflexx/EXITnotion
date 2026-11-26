import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EXITnotion", template: "%s · EXITnotion" },
  description: "Werkplek voor plannen, notuleren en ideeën uitwerken bij EXIT Toys",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Changa+One&family=Rajdhani:wght@500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

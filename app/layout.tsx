import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import PrivyProviders from "@/components/PrivyProviders";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Levee",
  description: "Money held against a date, so you always know what is safe to spend.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`}>
      <body>
        <PrivyProviders>{children}</PrivyProviders>
      </body>
    </html>
  );
}

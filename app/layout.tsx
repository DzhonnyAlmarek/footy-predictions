import "./globals.css";
import TestAccountSwitch from "./TestAccountSwitch";
import type { Metadata } from "next";
import { Russo_One, Rubik_Mono_One } from "next/font/google";

const clubTitleFont = Russo_One({ weight: "400", subsets: ["latin", "cyrillic"], variable: "--font-club-title", display: "swap" });
const clubSloganFont = Rubik_Mono_One({ weight: "400", subsets: ["latin", "cyrillic"], variable: "--font-club-slogan", display: "swap" });

export const metadata: Metadata = {
  title: "Клуб им. А.Н. Мурашева",
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className={`${clubTitleFont.variable} ${clubSloganFont.variable}`}>
        <div className="appRoot">
          <TestAccountSwitch />
          {children}
        </div>
      </body>
    </html>
  );
}

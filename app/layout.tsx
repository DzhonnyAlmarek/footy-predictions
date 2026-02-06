import "./globals.css";
import type { Metadata } from "next";

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
      <body>
        <div className="appRoot">
          {children}
        </div>
      </body>
    </html>
  );
}

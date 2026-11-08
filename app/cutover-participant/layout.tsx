import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Клуб им. А.Н. Мурашева",
  description: "Клуб им. А.Н. Мурашева — футбольные прогнозы, результаты, рейтинги и аналитика. Точность решает.",
};

export default function CutoverParticipantLayout({ children }: { children: React.ReactNode }) {
  return children;
}

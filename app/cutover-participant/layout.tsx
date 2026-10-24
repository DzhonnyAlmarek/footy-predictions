import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Клуб им. А.Н. Мурашева — Golden Whistle",
  description: "Клуб им. А.Н. Мурашева. Основан 6 июня 2008 года. Футбольный конкурс прогнозов Golden Whistle.",
};

export default function CutoverParticipantLayout({ children }: { children: React.ReactNode }) {
  return children;
}

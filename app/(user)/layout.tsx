import SiteHeader from "@/app/_components/SiteHeader";
import BottomBar from "@/app/_components/BottomBar";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="hasBottomBar userMain">
        {children}
      </main>
      <BottomBar />
    </>
  );
}

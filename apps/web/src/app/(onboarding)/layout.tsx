export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  // Full-screen, distraction-free. Auth is enforced by middleware; the app shell
  // (nav, Bixy widget) is intentionally absent here.
  return <div className="min-h-[100dvh] bg-background">{children}</div>;
}

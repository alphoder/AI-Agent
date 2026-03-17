export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        {/* Learner header placeholder */}
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

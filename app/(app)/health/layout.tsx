import { HealthTabs } from "./HealthTabs";

export default function HealthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Health</h1>
        <p className="text-muted-foreground">
          Training, food, water and body composition — logged in seconds, read
          by your assistant.
        </p>
      </div>
      <HealthTabs />
      {children}
    </div>
  );
}

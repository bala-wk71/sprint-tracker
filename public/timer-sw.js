// Service worker for the focus timer. Its only job is showing "time's up"
// notifications — phones refuse `new Notification()` from a page — and
// bringing the app forward (and silencing the alarm) when one is tapped.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL("/daily#time", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const ours = windows.filter((w) => new URL(w.url).origin === self.location.origin);
      for (const w of ours) w.postMessage({ type: "focus-timer:stop-alarm" });
      if (ours[0] && "focus" in ours[0]) return ours[0].focus();
      return self.clients.openWindow(target);
    })
  );
});

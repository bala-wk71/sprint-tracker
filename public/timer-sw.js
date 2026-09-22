// Service worker for the focus timer. Its only job is showing "time's up"
// notifications — phones refuse `new Notification()` from a page — and
// bringing the app forward when one is tapped.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL("/daily#time", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

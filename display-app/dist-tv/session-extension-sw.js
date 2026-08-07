self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  notification.close();

  const minutes = event.action === "extend-30"
    ? 30
    : event.action === "extend-60"
      ? 60
      : null;

  event.waitUntil((async () => {
    if (minutes && data.apiBase && data.roomId) {
      try {
        const response = await fetch(`${data.apiBase}/rooms/${data.roomId}/extend`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ add_minutes: minutes }),
        });
        if (response.ok) {
          const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
          clients.forEach((client) => client.postMessage({ type: "session_extended", minutes }));
          await self.registration.showNotification("Session extended", {
            body: minutes === 60 ? "1 hour was added to your session." : "30 minutes were added to your session.",
            tag: "noraebox-extension-confirmed",
          });
          return;
        }
      } catch {
        // Fall through and bring the display forward so the guest can retry.
      }
    }

    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const displayClient = clients[0];
    if (displayClient) {
      await displayClient.focus();
    } else if (data.displayUrl) {
      await self.clients.openWindow(data.displayUrl);
    }
  })());
});

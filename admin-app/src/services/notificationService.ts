import { playNotificationSound as playSound } from "./audioService";

export type SessionFinishedRoom = {
  sessionId: string;
  roomId: string;
  roomName: string;
  finishedAt?: string;
};

export function requestPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) {
    return Promise.resolve("denied");
  }

  if (Notification.permission !== "default") {
    return Promise.resolve(Notification.permission);
  }

  return Notification.requestPermission();
}

export async function playNotificationSound(): Promise<void> {
  await playSound();
}

export async function notifySessionFinished(room: SessionFinishedRoom): Promise<void> {
  await playNotificationSound();

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const notification = new Notification("Session Finished", {
    body: `${room.roomName} has finished. Please assist the customer.`,
    icon: "/logo_norebox.jpg",
    tag: `session-finished-${room.sessionId}`,
    requireInteraction: true,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

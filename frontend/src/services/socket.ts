import io from "socket.io-client";

declare global { 
  interface Window { 
    __SOCKET_NEW_COUNT?: number 
  }
}

type ClientSocket = ReturnType<typeof io>;
let socket: ClientSocket | null = null;

/**
 *
 */
export function getSocket(): ClientSocket {
  if (socket) return socket;

  socket = io("/", {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });

  window.__SOCKET_NEW_COUNT = (window.__SOCKET_NEW_COUNT ?? 0) + 1
  const timestamp = new Date().toISOString()
  console.info(`[socket] created instance #${window.__SOCKET_NEW_COUNT} at ${timestamp}`)
  console.info('[socket] stack trace:', new Error().stack)

  socket.on("connect", () => console.log("[WS] connected", socket?.id));
  socket.on("disconnect", (reason: any) => console.log("[WS] disconnect", reason));
  socket.on("connect_error", (e: Error) => console.warn("[WS] connect_error", e));
  socket.on("reconnect_attempt", (n: number) => console.log("[WS] reconnect_attempt", n));

  return socket;
}

/**
 *
 */
export function on(event: string, handler: (...args: any[]) => void) {
  getSocket().on(event, handler);
}

/**
 *
 */
export function off(event: string, handler?: (...args: any[]) => void) {
  getSocket().off(event, handler as any);
}

/**
 *
 */
export function emit(event: string, payload?: any) {
  getSocket().emit(event, payload);
}

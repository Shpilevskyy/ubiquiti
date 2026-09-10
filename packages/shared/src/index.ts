export interface HelloResponse {
  message: string;
  timestamp: string;
}

export const SOCKET_EVENTS = {
  HELLO: 'hello',
} as const;

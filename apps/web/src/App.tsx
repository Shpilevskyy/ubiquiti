import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_EVENTS, type HelloResponse } from '@ubiquiti-todo/shared';

export default function App() {
  const [restMessage, setRestMessage] = useState('loading...');
  const [socketMessage, setSocketMessage] = useState('connecting...');

  useEffect(() => {
    fetch('/api/hello')
      .then((res) => res.json() as Promise<HelloResponse>)
      .then((data) => setRestMessage(data.message))
      .catch(() => setRestMessage('failed to reach server'));
  }, []);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });

    socket.on(SOCKET_EVENTS.HELLO, (data: HelloResponse) => {
      setSocketMessage(data.message);
    });

    socket.on('connect_error', () => {
      setSocketMessage('failed to connect');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
      <h1>Ubiquiti Todo — architecture smoke test</h1>
      <p>
        <strong>REST (/api/hello):</strong> {restMessage}
      </p>
      <p>
        <strong>WebSocket (socket.io):</strong> {socketMessage}
      </p>
    </main>
  );
}

import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '15s', target: 25 },  // Ramp to 25 concurrent socket clients
    { duration: '45s', target: 50 },  // Maintain 50 concurrent editors
    { duration: '15s', target: 0 },   // Ramp down
  ],
  thresholds: {
    ws_connecting: ['p(95)<300'], // Connection handshake under 300ms
  },
};

export default function () {
  const syncServerUrl = __ENV.SYNC_URL || 'ws://localhost:4001';
  const roomName = 'flowmesh-main-workspace';
  const url = `${syncServerUrl}?room=${roomName}&userId=user_${__VU}`;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      // 1. Send Yjs Protocol SyncStep1
      const syncStep1 = new Uint8Array([0, 0, 1, 0]);
      socket.sendBinary(syncStep1.buffer);

      // 2. Periodically send awareness cursor updates
      socket.setInterval(() => {
        const awarenessUpdate = JSON.stringify({
          type: 'awareness',
          user: {
            id: `user_${__VU}`,
            name: `LoadUser #${__VU}`,
            cursor: { x: Math.random() * 1200, y: Math.random() * 800 },
          },
        });
        socket.send(awarenessUpdate);
      }, 500);
    });

    socket.on('message', (data) => {
      check(data, {
        'received message': (msg) => msg !== null && msg !== undefined,
      });
    });

    socket.on('close', () => {
      // Clean disconnect
    });

    // Run connection for 10 seconds
    socket.setTimeout(() => {
      socket.close();
    }, 10000);
  });

  check(res, {
    'websocket connected': (r) => r && r.status === 101,
  });
}

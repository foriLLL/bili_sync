import WebSocket, { WebSocketServer } from "ws";

interface State {
  currentTime: number;
  isPaused: boolean;
  playbackRate: number;
}

interface Data {
  type: string;
  sessionId: string;
  state?: State;
}

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  sessionId: string | null;
}

const server = new WebSocketServer({ port: 2333 });
const sessions: Record<string, ExtWebSocket[]> = {};

server.on("connection", (socket: ExtWebSocket) => {
  socket.isAlive = true;
  socket.sessionId = null;

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (message: string) => {
    const data: Data = JSON.parse(message);
    console.log(data);

    // 更新心跳时间
    socket.isAlive = true;

    // 处理加入会话的请求
    if (data.type === "join") {
      socket.sessionId = data.sessionId;
      if (!sessions[socket.sessionId]) {
        sessions[socket.sessionId] = [];
      }
      sessions[socket.sessionId].push(socket);
    }

    // 处理状态更新的请求
    if (data.type === "update" && socket.sessionId && data.state) {
      // 向同一会话的其他客户端广播状态
      sessions[socket.sessionId].forEach((client) => {
        if (client !== socket && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(data.state));
        }
      });
    }

    // 处理离开会话的请求
    if (data.type === "leave" && socket.sessionId) {
      sessions[socket.sessionId] = sessions[socket.sessionId].filter(
        (client) => client !== socket
      );
      socket.close();
    }
  });

  socket.on("close", () => {
    // 从会话中移除断开的连接
    if (socket.sessionId) {
      sessions[socket.sessionId] = sessions[socket.sessionId].filter(
        (client) => client !== socket
      );
    }
  });
});

// 定期检查所有连接的活跃性
const interval = setInterval(() => {
  server.clients.forEach((socket) => {
    const extSocket = socket as ExtWebSocket;
    if (!extSocket.isAlive) {
      // 终止连接并从会话中移除
      extSocket.terminate();
      if (extSocket.sessionId) {
        sessions[extSocket.sessionId] = sessions[extSocket.sessionId].filter(
          (client) => client !== extSocket
        );
      }
    } else {
      extSocket.isAlive = false;
      extSocket.ping();
    }
  });
}, 30000); // 每30秒检查一次

server.on("close", () => {
  clearInterval(interval);
});

console.log("WebSocket server is running on ws://localhost:2333");

import fs from "fs";
import https from "https";
import WebSocket, { WebSocketServer } from "ws";

interface State {
  url?: string;
  timestamp: number;
  currentTime: number;
  isPaused: boolean;
  playbackRate: number;
}

interface Data {
  type: "join" | "update" | "leave";
  sessionId: string;
  state?: State;
}

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
  sessionId: string | null;
}

const useHttps = true; // 是否使用 HTTPS 和 WSS
const port = 2333;

// 创建服务器（支持 WSS）
const server = useHttps
  ? https.createServer({
      cert: fs.readFileSync("/root/nginx_certs/foril.space_bundle.crt"), // 证书链文件
      key: fs.readFileSync("/root/nginx_certs/foril.space.key"), // 私钥文件
    })
  : undefined;

// 创建 WebSocket Server
const wss = new WebSocketServer({ server, port: useHttps ? undefined : port });
const sessions: Record<string, ExtWebSocket[]> = {};

// 处理连接事件
wss.on("connection", (socket: WebSocket) => {
  const extSocket = socket as ExtWebSocket;
  extSocket.isAlive = true;
  extSocket.sessionId = null;

  console.log("New connection established.");

  extSocket.on("pong", () => {
    extSocket.isAlive = true;
  });

  extSocket.on("message", (message: string) => {
    try {
      const data: Data = JSON.parse(message);
      console.log("Received message:", data);

      // 更新心跳时间
      extSocket.isAlive = true;

      // 处理不同的消息类型
      if (data.type === "join") handleJoin(extSocket, data.sessionId);
      if (data.type === "update") handleUpdate(extSocket, data);
      if (data.type === "leave") handleLeave(extSocket);
    } catch (error) {
      console.error("Failed to process message:", error);
    }
  });

  extSocket.on("close", () => {
    console.log("Client disconnected.");
    handleLeave(extSocket);
  });
});

// 定期检查连接状态
const interval = setInterval(() => {
  wss.clients.forEach((socket) => {
    const extSocket = socket as ExtWebSocket;
    if (!extSocket.isAlive) {
      console.log("Terminating inactive connection.");
      terminateSocket(extSocket);
    } else {
      extSocket.isAlive = false;
      extSocket.ping();
    }
  });
}, 30000); // 每30秒检查一次

wss.on("close", () => {
  clearInterval(interval);
  console.log("WebSocket server is shutting down.");
});

if (useHttps) {
  server?.listen(port, () =>
    console.log(`WebSocket server is running on wss://foril.space:${port}`)
  );
} else {
  console.log(`WebSocket server is running on ws://localhost:${port}`);
}

// --- Helper Functions ---

/**
 * 处理客户端加入会话
 */
function handleJoin(socket: ExtWebSocket, sessionId: string) {
  console.log(`Client joining session: ${sessionId}`);
  socket.sessionId = sessionId;

  if (!sessions[sessionId]) {
    sessions[sessionId] = [];
  }

  // 防止重复加入会话
  if (!sessions[sessionId].includes(socket)) {
    sessions[sessionId].push(socket);
  }

  console.log(
    `Current clients in session ${sessionId}:`,
    sessions[sessionId].length
  );
}

/**
 * 处理状态更新
 */
function handleUpdate(socket: ExtWebSocket, data: Data) {
  if (!socket.sessionId || !data.state) {
    console.warn("Invalid update request: sessionId or state missing.");
    return;
  }

  console.log(`Broadcasting update to session ${socket.sessionId}.`);
  const sessionSockets = sessions[socket.sessionId];
  if (!sessionSockets) return;

  sessionSockets.forEach((client) => {
    if (client !== socket && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data.state));
    }
  });
}

/**
 * 处理客户端离开会话
 */
function handleLeave(socket: ExtWebSocket) {
  if (!socket.sessionId) return;

  console.log(`Client leaving session: ${socket.sessionId}`);
  const sessionSockets = sessions[socket.sessionId];
  if (!sessionSockets) return;

  sessions[socket.sessionId] = sessionSockets.filter(
    (client) => client !== socket
  );

  // 如果会话中没有客户端，删除会话
  if (sessions[socket.sessionId].length === 0) {
    delete sessions[socket.sessionId];
    console.log(`Session ${socket.sessionId} is now empty and removed.`);
  }

  socket.sessionId = null;
}

/**
 * 终止 WebSocket 连接
 */
function terminateSocket(socket: ExtWebSocket) {
  console.log("Terminating socket.");
  handleLeave(socket); // 从会话中移除
  socket.terminate();
}

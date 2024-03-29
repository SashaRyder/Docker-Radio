import express from "express";
import http from "http";
import request from "request";
import { Server, Socket } from "socket.io";
import { promisify } from "util";
import { spawn, exec } from "child_process";
import fs from "fs/promises";

const execAsync = promisify(exec);

const app = express();
const server = http.createServer(app);
const PORT = 4000;

const icecastUrl = "http://localhost:8000";
const metadataEndpoint = "/status-json.xsl";
const oggStream = "/stream";
const mpegStream = "/backup_stream";

const sourceOggUrl = `${icecastUrl}${oggStream}`;
const sourceMpegUrl = `${icecastUrl}${mpegStream}`;
const metadataUrl = `${icecastUrl}${metadataEndpoint}`;

let users = [];
let metadataCheckInterval: NodeJS.Timeout | null = null;
let currentMetadata = { artist: "", title: "" };

const startService = async (
  serviceName: string,
  command: string,
  args: string[] = [],
  workingDir = "",
  restartOnClose = false
): Promise<void> => {
  const processLog = async (logText: string) => {
    const date = new Date();
    const logFileLocation = `logs/${serviceName.toLowerCase()}-${date.getDate()}-${date.getMonth()}.log`;
    await fs.appendFile(logFileLocation, logText);
  };
  console.log(`Starting ${serviceName}`);
  const commandSplit = command.split(" ");
  const processName = commandSplit[0];
  const exec = spawn(processName, args, { cwd: workingDir });
  exec.stdout.on("data", processLog);
  exec.stderr.on("data", processLog);
  return new Promise((resolve) => {
    exec.once("close", () => {
      exec.stdout.off("data", processLog);
      exec.stderr.off("data", processLog);
      if (restartOnClose) {
        startService(serviceName, command, args, workingDir, restartOnClose); //restart service
      }
      resolve();
    });
  });
};

const checkMetadata = () => {
  request(metadataUrl, { json: true }, (err, resp, body) => {
    try {
      let sources = body?.icestats?.source;
      if (err || !sources) return;
      if (!Array.isArray(sources)) {
        sources = [sources];
      }
      const metadata: { artist: string; title: string } = sources.find(
        (source: { listenurl: string }) => source?.listenurl === sourceOggUrl
      );
      if (!metadata) {
        return;
      }
      if (
        metadata.artist.toString() !== currentMetadata.artist ||
        metadata.title.toString() !== currentMetadata.title
      ) {
        currentMetadata = {
          artist: metadata.artist.toString(),
          title: metadata.title.toString(),
        };
        io.emit("TRACK_CHANGED", currentMetadata);
      }
    } catch (error) {
      console.log(`Error:: ${JSON.stringify(body)}`);
    }
  });
};

const io = new Server(server, {
  path: "/socket",
});

const announceListeners = (socket?: Socket) => {
  if (socket) {
    socket.emit(
      "LISTENER_COUNT",
      users.filter(({ listening }) => listening).length
    );
  } else {
    io.emit(
      "LISTENER_COUNT",
      users.filter(({ listening }) => listening).length
    );
  }
};

io.on("connection", (socket) => {
  users = [...users, { id: socket.id, listening: false }];
  if (!metadataCheckInterval) {
    metadataCheckInterval = setInterval(checkMetadata, 1000);
  }
  socket.emit("TRACK_CHANGED", currentMetadata);
  announceListeners(socket);
  socket.on("LISTEN_STATE_CHANGED", (value) => {
    const user = users.find(({ id }) => id === socket.id);
    if (user) {
      user.listening = value;
      users = [...users.filter(({ id }) => id !== socket.id), user];
    }
    announceListeners();
  });
  socket.once("disconnect", () => {
    users = users.filter(({ id }) => id !== socket.id);
    if (users.length > 0) {
      announceListeners();
    } else {
      clearInterval(metadataCheckInterval);
      metadataCheckInterval = null;
      currentMetadata = { artist: "", title: "" };
    }
  });
});

app.use(express.static("build"));

app.get(oggStream, (req, res) => req.pipe(request.get(sourceOggUrl)).pipe(res));

app.get(mpegStream, (req, res) =>
  req.pipe(request.get(sourceMpegUrl)).pipe(res)
);

app.get("/trackcount", async (_, res) => {
  const { stdout } = await execAsync("wc -l < /etc/ices2/playlist.txt");
  const count = parseInt(stdout.trim()) || 0;
  res.send((count + 1).toString()); // +1 because last song doesnt get added to wc -l command
});

server.listen(PORT);

const ffmpegArgs = [
  "-i",
  sourceOggUrl,
  "-vn",
  "-codec:a",
  "libmp3lame",
  "-f",
  "mp3",
  "-content_type",
  "audio/mpeg",
  `icecast://source:${process.env.ICECAST_PASSWORD}@${sourceMpegUrl.replace(
    "http://",
    ""
  )}`,
];

await startService("Icecast2 config", "sh", ["/app/setup.sh"], "/app");
await startService("Icecast2", "icecast", ["-b", "-c", "/etc/icecast.xml"]);
Promise.all([
  startService(
    "Ices2",
    "ices",
    ["/etc/ices2/ices-playlist.xml"],
    "/etc/ices2",
    true
  ),
  startService("MPEG_Relay", "ffmpeg", ffmpegArgs, "", true),
]);
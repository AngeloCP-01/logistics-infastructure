import { createServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3000);
const app = createServer();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ level: "info", message: `listening on ${PORT}` }));
});

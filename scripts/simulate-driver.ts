#!/usr/bin/env tsx
/**
 * V1 driver simulation — a Socket.IO client that exercises the tracking-service WS
 * protocol exactly as a future mobile/browser driver would (spec §9). It:
 *   1. connects with a driver JWT (sub = the assigned driverId) for a given orderId,
 *   2. joins the order room,
 *   3. emits delivery:pickup,
 *   4. streams location:update along a straight pickup→dropoff line at --interval ms,
 *   5. emits delivery:complete.
 *
 * Usage:
 *   tsx scripts/simulate-driver.ts \
 *     --url ws://localhost:3005 \
 *     --order <orderId> --driver <driverId> \
 *     --secret <JWT_SECRET> \
 *     --from 14.5995,120.9842 --to 14.6760,121.0437 \
 *     [--steps 20] [--interval 3000]
 *
 * In a real demo the URL is the gateway (wss://api.<domain>/v1/tracking), the JWT is
 * minted by auth-service, and the from/to come from the order's pickup/dropoff.
 */
import { io, type Socket } from "socket.io-client";
import jwt from "jsonwebtoken";

interface Args {
  url: string; order: string; driver: string; secret: string;
  from: [number, number]; to: [number, number]; steps: number; interval: number;
}

function parseArgs(): Args {
  const m = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i]?.replace(/^--/, "");
    if (k) m.set(k, process.argv[i + 1] ?? "");
  }
  const coord = (s: string | undefined, label: string): [number, number] => {
    const parts = (s ?? "").split(",").map(Number);
    if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) throw new Error(`--${label} must be "lat,lng"`);
    return [parts[0], parts[1]];
  };
  const req = (k: string): string => {
    const v = m.get(k);
    if (!v) throw new Error(`missing --${k}`);
    return v;
  };
  return {
    url: m.get("url") ?? "ws://localhost:3005",
    order: req("order"), driver: req("driver"), secret: req("secret"),
    from: coord(m.get("from"), "from"), to: coord(m.get("to"), "to"),
    steps: Number(m.get("steps") ?? 20), interval: Number(m.get("interval") ?? 3000),
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const token = jwt.sign({ role: "driver" }, args.secret, { algorithm: "HS256", subject: args.driver, expiresIn: "1h" });

  const socket: Socket = io(args.url, { auth: { token }, transports: ["websocket"], reconnection: true });

  socket.on("connect_error", (err) => {
    process.stderr.write(`connect_error: ${err.message}\n`);
    process.exit(1);
  });
  socket.on("error", (e: { code?: string; message?: string }) => {
    process.stderr.write(`server error: ${e.code} ${e.message}\n`);
  });

  await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
  process.stdout.write(`connected as driver ${args.driver}\n`);

  socket.emit("room:join", { orderId: args.order });
  await sleep(200);

  socket.emit("delivery:pickup", { orderId: args.order });
  process.stdout.write("pickup emitted → delivery.in_transit\n");
  await sleep(args.interval);

  for (let i = 1; i <= args.steps; i++) {
    const t = i / args.steps;
    const lat = lerp(args.from[0], args.to[0], t);
    const lng = lerp(args.from[1], args.to[1], t);
    socket.emit("location:update", { orderId: args.order, lat, lng, accuracy: 5 });
    process.stdout.write(`location ${i}/${args.steps}: ${lat.toFixed(5)},${lng.toFixed(5)}\n`);
    await sleep(args.interval);
  }

  socket.emit("delivery:complete", { orderId: args.order });
  process.stdout.write("complete emitted → delivery.completed\n");
  await sleep(500);
  socket.close();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

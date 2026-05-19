import request from "supertest";
import { createServer } from "../src/server.js";

describe("hello-world-service", () => {
  const app = createServer();

  it("GET /healthz returns 200 with status ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /readyz returns 200 with status ready", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready" });
  });

  it("GET /hello returns the greeting", async () => {
    const res = await request(app).get("/hello");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "hello, logistics" });
  });

  it("GET /unknown returns 404 Problem Details", async () => {
    const res = await request(app).get("/unknown");
    expect(res.status).toBe(404);
    expect(res.body.type).toBeDefined();
    expect(res.body.title).toBeDefined();
    expect(res.body.status).toBe(404);
  });
});

import express, { type Express, type Request, type Response } from "express";

export function createServer(): Express {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ready" });
  });

  app.get("/hello", (_req: Request, res: Response) => {
    res.status(200).json({ message: "hello, logistics" });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      type: "https://errors.logistics/not-found",
      title: "Not Found",
      status: 404,
    });
  });

  return app;
}

import { z } from "zod";

export const users = {
  id: z.string(),
  email: z.string().email(),
  created_at: z.date(),
  is_admin: z.boolean().default(false)
};

export const recordings = {
  id: z.string(),
  email: z.string().email(),
  audio_url: z.string(),
  status: z.enum(["pending", "under_review", "scored", "closed"]),
  ai_score: z.number().nullable(),
  created_at: z.date()
};

export const portalStatus = {
  is_open: z.boolean()
};

export const insertUserSchema = z.object({
  email: z.string().email(),
  is_admin: z.boolean().optional()
});

export const insertRecordingSchema = z.object({
  email: z.string().email(),
  audio_url: z.string(),
  status: z.enum(["pending", "under_review", "scored", "closed"]).default("pending")
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = {
  id: string;
  email: string;
  created_at: Date;
  is_admin: boolean;
};

export type InsertRecording = z.infer<typeof insertRecordingSchema>;
export type Recording = {
  id: string;
  email: string;
  audio_url: string;
  status: "pending" | "under_review" | "scored" | "closed";
  ai_score: number | null;
  created_at: Date;
};

export type PortalStatus = {
  is_open: boolean;
};

import {
  type User,
  type InsertUser,
  type Recording,
  type InsertRecording,
  type PortalStatus,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Recordings
  getRecording(id: string): Promise<Recording | undefined>;
  getRecordingsByEmail(email: string): Promise<Recording[]>;
  getAllRecordings(): Promise<Recording[]>;
  createRecording(recording: InsertRecording): Promise<Recording>;
  updateRecording(id: string, updates: Partial<Recording>): Promise<Recording>;

  // Portal Status
  getPortalStatus(): Promise<PortalStatus>;
  setPortalStatus(status: PortalStatus): Promise<PortalStatus>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private recordings: Map<string, Recording>;
  private portalStatus: PortalStatus;

  constructor() {
    this.users = new Map();
    this.recordings = new Map();
    this.portalStatus = { is_open: true };

    // Seed admin user
    const adminId = randomUUID();
    const adminUser: User = {
      id: adminId,
      email: "admin@pingdoh2.com",
      created_at: new Date(),
      is_admin: true,
    };
    this.users.set(adminId, adminUser);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((user) => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      created_at: new Date(),
      is_admin: insertUser.is_admin || false,
    };
    this.users.set(id, user);
    return user;
  }

  async getRecording(id: string): Promise<Recording | undefined> {
    return this.recordings.get(id);
  }

  async getRecordingsByEmail(email: string): Promise<Recording[]> {
    return Array.from(this.recordings.values()).filter(
      (recording) => recording.email === email
    );
  }

  async getAllRecordings(): Promise<Recording[]> {
    return Array.from(this.recordings.values()).sort(
      (a, b) => b.created_at.getTime() - a.created_at.getTime()
    );
  }

  async createRecording(insertRecording: InsertRecording): Promise<Recording> {
    const id = randomUUID();
    const recording: Recording = {
      ...insertRecording,
      id,
      ai_score: null,
      ai_result: null,
      created_at: new Date(),
    };
    this.recordings.set(id, recording);
    return recording;
  }

  async updateRecording(
    id: string,
    updates: Partial<Recording>
  ): Promise<Recording> {
    const recording = this.recordings.get(id);
    if (!recording) {
      throw new Error("Recording not found");
    }
    const updated = { ...recording, ...updates };
    this.recordings.set(id, updated);
    return updated;
  }

  async getPortalStatus(): Promise<PortalStatus> {
    return this.portalStatus;
  }

  async setPortalStatus(status: PortalStatus): Promise<PortalStatus> {
    this.portalStatus = status;
    return this.portalStatus;
  }
}

export const storage = new MemStorage();

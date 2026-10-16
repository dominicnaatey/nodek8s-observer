import { v4 as uuidv4 } from 'uuid';
import { User } from '../types/user.js';
import { logger } from '../logger.js';
import { appUsersTotal } from '../metrics/httpMetrics.js';

class UserStore {
  private users: Map<string, User> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData(): void {
    const seedUsers: Omit<User, 'id' | 'createdAt'>[] = [
      { name: 'Alice Johnson', email: 'alice@example.com' },
      { name: 'Bob Smith', email: 'bob@example.com' },
      { name: 'Charlie Davis', email: 'charlie@example.com' },
      { name: 'Diana Prince', email: 'diana@example.com' },
      { name: 'Eve Wilson', email: 'eve@example.com' },
    ];

    seedUsers.forEach((userData) => {
      const user: User = {
        id: uuidv4(),
        name: userData.name,
        email: userData.email,
        createdAt: new Date().toISOString(),
      };
      this.users.set(user.id, user);
    });

    appUsersTotal.set(this.users.size);
    logger.info({ msg: 'User store seeded', count: this.users.size });
  }

  getAll(): User[] {
    return Array.from(this.users.values());
  }

  getById(id: string): User | undefined {
    return this.users.get(id);
  }

  create(data: Omit<User, 'id' | 'createdAt'>): User {
    const user: User = {
      id: uuidv4(),
      name: data.name,
      email: data.email,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    appUsersTotal.set(this.users.size);
    return user;
  }

  update(id: string, data: Omit<User, 'id' | 'createdAt'>): User | undefined {
    const existing = this.users.get(id);
    if (!existing) {
      return undefined;
    }

    const updated: User = {
      ...existing,
      name: data.name,
      email: data.email,
    };
    this.users.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    const deleted = this.users.delete(id);
    if (deleted) appUsersTotal.set(this.users.size);
    return deleted;
  }

  count(): number {
    return this.users.size;
  }
}

// Singleton instance
export const userStore = new UserStore();

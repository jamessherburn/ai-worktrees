import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

export class JsonStore<T> {
  private cached: T | undefined;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly fileName: string,
    private readonly defaults: T,
  ) {}

  private path(): string {
    return join(app.getPath('userData'), this.fileName);
  }

  async read(): Promise<T> {
    if (this.cached) return this.cached;
    try {
      const raw = await fs.readFile(this.path(), 'utf-8');
      this.cached = { ...this.defaults, ...JSON.parse(raw) } as T;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cached = { ...this.defaults };
      } else {
        throw err;
      }
    }
    return this.cached!;
  }

  async write(value: T): Promise<void> {
    this.cached = value;
    this.writeQueue = this.writeQueue.then(async () => {
      const file = this.path();
      await fs.mkdir(dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(value, null, 2), 'utf-8');
    });
    return this.writeQueue;
  }

  async update(mutator: (current: T) => T): Promise<T> {
    const current = await this.read();
    const next = mutator(current);
    await this.write(next);
    return next;
  }
}

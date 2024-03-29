import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import * as zlib from 'zlib';

export function exists(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, stats) => {
      if (err && err.code === 'ENOENT') return resolve(false);
      err ? reject(err) : resolve(true);
    });
  });
}

export function mkdtemp(prefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.mkdtemp(join(os.tmpdir(), prefix), (err, dir) => {
      err ? reject(err) : resolve(dir);
    });
  });
}

export function mkdir(
  path: string,
  options?: { recursive?: boolean; mode?: number }
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdir(path, Object.assign({ mode: 0o755 }, options), err => {
      err ? reject(err) : resolve();
    });
  });
}

export function readdir(path: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(path, (err, data) => {
      err ? reject(err) : resolve(data);
    });
  });
}

export function readFile(path: string, encoding: 'utf8'): Promise<string> {
  return new Promise((resolve, reject) => {
    fs.readFile(path, (err, data) => {
      if (err) return reject(err);
      if (!isGzipped(data)) return resolve(data.toString(encoding));
      // NOTE: nodejs/node#8871
      try {
        const buf = zlib.gunzipSync(data);
        resolve(buf.toString(encoding));
      } catch (err) {
        reject(err);
      }
    });
  });
}

function isGzipped(buf: Buffer) {
  return buf.length >= 3 && buf[0] === 0x1f && buf[1] === 0x8b && buf[2] === 0x08;
}

export function writeFile(path: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(path, data, err => {
      err ? reject(err) : resolve();
    });
  });
}

export function writeGzipFile(path: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // NOTE: nodejs/node#8871
    try {
      const buf = zlib.gzipSync(data);
      fs.writeFile(path, buf, err => {
        err ? reject(err) : resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function appendFile(path: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.appendFile(path, data, err => {
      err ? reject(err) : resolve();
    });
  });
}

export function lstat(path: string): Promise<fs.Stats> {
  return new Promise((resolve, reject) => {
    fs.lstat(path, (err, stats) => {
      err ? reject(err) : resolve(stats);
    });
  });
}

export function unlink(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.unlink(path, err => {
      if (err && err.code === 'ENOENT') return resolve();
      err ? reject(err) : resolve();
    });
  });
}

export function rmdir(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.rmdir(path, err => {
      err ? reject(err) : resolve();
    });
  });
}

export async function rmrf(dir: string) {
  if (await exists(dir)) {
    const rms: Array<Promise<void>> = [];
    for (const file of await readdir(dir)) {
      const f = join(dir, file);
      if ((await lstat(f)).isDirectory()) {
        rms.push(rmrf(f));
      } else {
        rms.push(unlink(f));
      }
    }
    await Promise.all(rms);
    await rmdir(dir);
  }
}

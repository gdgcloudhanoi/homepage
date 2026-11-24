// Runs requests on up to `size` workers, one request per worker at a time. Workers start on demand
// and are terminated after a minute without work, which frees the loaded models.

export type Pool<Req, Res> = {
  run(request: Req, transfer: Transferable[], signal: AbortSignal): Promise<Res>;
  dispose(): void;
};

type Job<Req, Res> = {
  request: Req;
  transfer: Transferable[];
  signal: AbortSignal;
  resolve: (response: Res) => void;
  reject: (reason: unknown) => void;
};

export function createPool<Req, Res>({
  create,
  size,
  discard,
  retire,
  idleMs = 60_000,
}: {
  create: () => Worker;
  size: number;
  // Frees what an aborted job's response holds (e.g. an ImageBitmap).
  discard?: (response: Res) => void;
  // Responses after which the worker is replaced instead of reused.
  retire?: (response: Res) => boolean;
  idleMs?: number;
}): Pool<Req, Res> {
  const idle: Worker[] = [];
  const busy = new Map<Worker, Job<Req, Res>>();
  const queue: Job<Req, Res>[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;

  function spawn() {
    const worker = create();
    worker.onmessage = ({ data }: MessageEvent<Res>) => {
      const job = busy.get(worker);
      busy.delete(worker);
      if (retire?.(data)) worker.terminate();
      else idle.push(worker);
      if (job?.signal.aborted) discard?.(data);
      else job?.resolve(data);
      pump();
    };
    worker.onerror = (event) => {
      event.preventDefault();
      const job = busy.get(worker);
      busy.delete(worker);
      worker.terminate();
      job?.reject(new Error(event.message || "Worker bị lỗi."));
      pump();
    };
    return worker;
  }

  function pump() {
    clearTimeout(timer);
    while (queue.length && (idle.length || busy.size < size)) {
      const job = queue.shift()!;
      const worker = idle.pop() ?? spawn();
      busy.set(worker, job);
      worker.postMessage(job.request, job.transfer);
    }
    if (!busy.size && !queue.length && idle.length) {
      timer = setTimeout(() => idle.splice(0).forEach((worker) => worker.terminate()), idleMs);
    }
  }

  return {
    run(request, transfer, signal) {
      return new Promise<Res>((resolve, reject) => {
        signal.throwIfAborted();
        const job = { request, transfer, signal, resolve, reject };
        signal.addEventListener(
          "abort",
          () => {
            const index = queue.indexOf(job);
            if (index >= 0) queue.splice(index, 1);
            reject(signal.reason);
          },
          { once: true },
        );
        queue.push(job);
        pump();
      });
    },
    dispose() {
      clearTimeout(timer);
      for (const worker of [...idle, ...busy.keys()]) worker.terminate();
      idle.length = 0;
      busy.clear();
      queue.length = 0;
    },
  };
}

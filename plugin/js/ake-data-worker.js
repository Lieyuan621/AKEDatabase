(() => {
    if (window.akeDataWorker) return;

    let workerUrl = null;
    let worker = null;
    let sequence = 0;
    const pending = new Map();

    function createWorker() {
        if (worker || !window.Worker) return worker;
        try {
            if (!workerUrl) {
                const source = `
                    self.onmessage = function (event) {
                        const { id, text } = event.data || {};
                        try {
                            const value = JSON.parse(String(text || '').replace(/("id"\\s*:\\s*)(-?\\d{16,})(?=\\s*[,}])/g, '$1"$2"'));
                            self.postMessage({ id, value });
                        } catch (error) {
                            self.postMessage({ id, error: error && error.message || String(error) });
                        }
                    };
                `;
                workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            }
            worker = new Worker(workerUrl);
            worker.onmessage = event => {
                const task = pending.get(event.data?.id);
                if (!task) return;
                pending.delete(event.data.id);
                if (event.data.error) task.reject(new Error(event.data.error));
                else task.resolve(event.data.value);
            };
            worker.onerror = error => {
                pending.forEach(task => task.reject(error.error || new Error('数据 Worker 执行失败')));
                pending.clear();
                worker.terminate();
                worker = null;
            };
        } catch {
            worker = null;
        }
        return worker;
    }

    function parse(text) {
        const activeWorker = createWorker();
        if (!activeWorker) return Promise.resolve().then(() => JSON.parse(String(text || '').replace(/("id"\s*:\s*)(-?\d{16,})(?=\s*[,}])/g, '$1"$2"')));
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            pending.set(id, { resolve, reject });
            activeWorker.postMessage({ id, text });
        });
    }

    window.akeDataWorker = Object.freeze({ parse });
})();

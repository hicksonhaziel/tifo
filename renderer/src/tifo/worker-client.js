export function createWorkerClient({ decoder, onMessage }) {
  const bridge = window.bridge
  const workers = {
    main: '/workers/main.js'
  }

  function send(type, payload = {}) {
    return bridge.writeWorkerIPC(workers.main, JSON.stringify({ ...payload, type }))
  }

  function start() {
    const cleanups = []
    bridge.startWorker(workers.main)

    cleanups.push(
      bridge.onWorkerStdout(workers.main, (data) => {
        console.log('worker stdout', '[', workers.main, ']:', decoder.decode(data))
      })
    )

    cleanups.push(
      bridge.onWorkerStderr(workers.main, (data) => {
        console.error('worker stderr', '[', workers.main, ']:', decoder.decode(data))
      })
    )

    cleanups.push(
      bridge.onWorkerIPC(workers.main, (data) => {
        const message = decoder.decode(data)
        console.log('worker ipc', '[', workers.main, ']:', message)

        let parsed = null
        try {
          parsed = JSON.parse(message)
        } catch {
          parsed = null
        }

        if (parsed?.type) {
          onMessage(parsed)
          return
        }

        if (message === 'Hello from worker') {
          onMessage({
            syncStatus: 'Worker ready',
            type: 'app:legacy-ready',
            workerStatus: 'ready'
          })
          bridge.writeWorkerIPC(workers.main, 'TIFO renderer ready')
        }
      })
    )

    cleanups.push(
      bridge.onWorkerExit(workers.main, (code) => {
        console.log('Worker exited with code', code)
        onMessage({
          syncStatus: 'Worker stopped',
          type: 'app:worker-exit',
          workerStatus: 'stopped'
        })
      })
    )

    return () => {
      for (const cleanup of cleanups) cleanup?.()
    }
  }

  return {
    send,
    start
  }
}

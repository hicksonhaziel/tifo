export function createWorkerClient({ decoder, onMessage }) {
  const bridge = window.bridge
  const workers = {
    main: '/workers/main.js'
  }
  const debugWorkerIpc =
    window.localStorage?.getItem?.('tifo:debug-worker-ipc') === '1' ||
    window.localStorage?.getItem?.('tifo:debug-worker-ipc') === 'true'

  function send(type, payload = {}) {
    return bridge.writeWorkerIPC(workers.main, JSON.stringify({ ...payload, type }))
  }

  function start() {
    const cleanups = []
    bridge.startWorker(workers.main)

    cleanups.push(
      bridge.onWorkerStdout(workers.main, (data) => {
        if (!debugWorkerIpc) return
        console.log(
          'worker stdout',
          '[',
          workers.main,
          ']:',
          truncateWorkerLog(decoder.decode(data))
        )
      })
    )

    cleanups.push(
      bridge.onWorkerStderr(workers.main, (data) => {
        console.error(
          'worker stderr',
          '[',
          workers.main,
          ']:',
          truncateWorkerLog(decoder.decode(data))
        )
      })
    )

    cleanups.push(
      bridge.onWorkerIPC(workers.main, (data) => {
        const message = decoder.decode(data)
        if (debugWorkerIpc) {
          console.log('worker ipc', '[', workers.main, ']:', workerMessageSummary(message))
        }

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
        if (debugWorkerIpc) console.log('Worker exited with code', code)
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

function workerMessageSummary(message) {
  let parsed = null
  try {
    parsed = JSON.parse(message)
  } catch {
    return truncateWorkerLog(message)
  }

  if (!parsed || typeof parsed !== 'object') return truncateWorkerLog(message)
  return {
    command: parsed.command,
    count: parsed.count,
    eventId: parsed.eventId,
    room: parsed.room || parsed.event?.room,
    size: message.length,
    status: parsed.status,
    type: parsed.type
  }
}

function truncateWorkerLog(value) {
  const text = String(value || '')
  return text.length > 500 ? `${text.slice(0, 500)}... (${text.length} chars)` : text
}

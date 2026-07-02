const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const path = require('bare-path')
const { createTifoRoomState } = require('./tifo-room-state')

const pipe = new FramedStream(Bare.IPC)

const updaterConfig = {
  dir: Bare.argv[2],
  app: Bare.argv[3],
  updates: Bare.argv[4] !== 'false',
  version: Bare.argv[5],
  upgrade: Bare.argv[6],
  name: Bare.argv[7]
}

const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime/corestore'))
const swarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm, store })

pear.updater.on('error', console.error)
if (updaterConfig.updates !== false) {
  swarm.on('connection', (connection) => store.replicate(connection))
  swarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

console.log('Application storage:', pear.storage)

pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))

function send(type, payload = {}) {
  pipe.write(JSON.stringify({ type, ...payload }))
}

const roomState = createTifoRoomState({ send })

goodbye(async () => {
  await swarm.destroy()
  await pear.close()
  await store.close()
})

pipe.on('data', async (data) => {
  const message = data.toString()
  if (message === 'pear:applyUpdate') {
    await pear.updater.applyUpdate()
    pipe.write('pear:updateApplied')
    return
  }

  let command = null
  try {
    command = JSON.parse(message)
  } catch {
    console.log(message)
    return
  }

  if (!command || typeof command !== 'object') {
    send('error', {
      command: 'unknown',
      message: 'Command must be a JSON object'
    })
    return
  }

  if (typeof command.type !== 'string' || command.type.trim() === '') {
    send('error', {
      command: 'unknown',
      message: 'Command type is required'
    })
    return
  }

  roomState.handleCommand(command)
})

send('app:ready', {
  syncStatus: 'Worker ready'
})

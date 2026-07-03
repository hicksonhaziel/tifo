import { RefreshCw, Wrench } from 'lucide-react'

export function OfflinePanel({ actions, metrics, offline, peerCount, syncDiagnostics }) {
  const modeLabel = offline.enabled
    ? 'Offline mode'
    : metrics.pending > 0
      ? 'Reconnect pending'
      : 'Network sync'
  const flushLabel =
    offline.lastFlushCount > 0
      ? `${offline.lastFlushCount} caught up`
      : offline.enabled
        ? 'Queueing locally'
        : peerCount > 0
          ? 'Peers available'
          : 'Searching'

  return (
    <section
      className={`offline-demo-panel ${offline.enabled ? 'enabled' : ''}`}
      aria-label='Offline reconnect status'
    >
      <div className='offline-demo-copy'>
        <span className='status-label'>Reconnect mode</span>
        <strong>{modeLabel}</strong>
        <p>{offline.detail}</p>
      </div>
      <div className='offline-demo-stats'>
        <div>
          <span>Pending</span>
          <strong>{metrics.pending}</strong>
        </div>
        <div>
          <span>Catch-up</span>
          <strong>{flushLabel}</strong>
        </div>
      </div>
      <label className='offline-toggle'>
        <input
          id='offline-toggle'
          type='checkbox'
          checked={offline.enabled}
          onChange={(event) => actions.setOffline(event.currentTarget.checked)}
        />
        <span aria-hidden='true'></span>
        <strong>Simulate offline</strong>
      </label>
      <div className='sync-diagnostics-strip'>
        <div>
          <span>App peers</span>
          <strong>{syncDiagnostics.appPeers}</strong>
        </div>
        <div>
          <span>Mailbox topics</span>
          <strong>{syncDiagnostics.knownMailboxTopics}</strong>
        </div>
        <div>
          <span>Transfers</span>
          <strong>
            {syncDiagnostics.pendingTransfers.chants +
              syncDiagnostics.pendingTransfers.chatMedia +
              syncDiagnostics.pendingTransfers.clips}
          </strong>
        </div>
        <button type='button' onClick={actions.requestRoomSync}>
          <RefreshCw size={14} strokeWidth={2.4} />
          Request sync
        </button>
        <button type='button' onClick={actions.recoverRoomHistory}>
          <Wrench size={14} strokeWidth={2.4} />
          Recover history
        </button>
      </div>
    </section>
  )
}

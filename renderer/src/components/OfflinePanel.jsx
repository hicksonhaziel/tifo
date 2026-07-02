export function OfflinePanel({ actions, metrics, offline, peerCount }) {
  const modeLabel = offline.enabled
    ? 'Offline simulation'
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
        <span className='status-label'>Reconnect demo</span>
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
    </section>
  )
}

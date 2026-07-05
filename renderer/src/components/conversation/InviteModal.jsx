import { AlertTriangle, Check, Copy, Link2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'

export function InviteModal({ inviteLink, kindLabel = 'group', onClose, title }) {
  const [copied, setCopied] = useState(false)

  async function copyInvite() {
    if (!inviteLink) return
    try {
      await window.navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className='invite-overlay'
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onClose}
      transition={{ duration: 0.16, ease: 'easeOut' }}
    >
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-labelledby='invite-modal-title'
        aria-modal='true'
        className='invite-modal'
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        onClick={(event) => event.stopPropagation()}
        role='dialog'
        transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
      >
        <div className='invite-modal-intro'>
          <div className='row aic between'>
            <span className='eyebrow invite-eyebrow'>Terrace invite</span>
            <button className='btn ghost icon' onClick={onClose} title='Close' type='button'>
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
          <h2 className='h-display' id='invite-modal-title'>
            Invite fans to <span>{title}</span>
          </h2>
          <p>
            Anyone with this invite can join the {kindLabel} and start chatting with the terrace.
          </p>
        </div>

        <div className='invite-modal-body'>
          <div className='col gap-2'>
            <span className='eyebrow'>Invite link</span>
            <div className='invite-input'>
              <span className='prefix'>
                <Link2 size={12} strokeWidth={2.4} />
              </span>
              <input
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={inviteLink}
              />
              <button className='btn primary sm' onClick={copyInvite} type='button'>
                {copied ? (
                  <>
                    <Check size={12} strokeWidth={2.4} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={12} strokeWidth={2.4} />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className='invite-scan-row'>
            <div className='invite-qr' aria-hidden='true' />
            <div className='col grow'>
              <div className='eyebrow'>Or scan</div>
              <div className='t-sm c-ink1'>Fans nearby can scan this to jump straight in.</div>
            </div>
          </div>

          <div className='invite-note'>
            <AlertTriangle size={14} strokeWidth={2.4} />
            <span>
              This invite is peer-to-peer. Share it only with fans you want inside the {kindLabel}.
            </span>
          </div>
        </div>

        <div className='invite-modal-footer'>
          <button className='btn ghost' onClick={onClose} type='button'>
            Close
          </button>
          <button className='btn primary' onClick={copyInvite} type='button'>
            {copied ? 'Copied' : 'Copy invite'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

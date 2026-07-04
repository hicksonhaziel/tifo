import { Search } from 'lucide-react'

export function SearchInput({ compact = false, onChange, placeholder, value }) {
  return (
    <div className='input'>
      <Search size={14} />
      <input
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        value={value}
      />
      {compact ? (
        <span className='rounded border border-white/[0.09] bg-[#14171A] px-1.5 py-[1px] font-mono text-[10px] text-[#8B8880]'>
          ⌘K
        </span>
      ) : null}
    </div>
  )
}

export function TextField({ icon, onChange, placeholder, value }) {
  return (
    <div className='input'>
      {icon ? <span className='prefix'>{icon}</span> : null}
      <input
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  )
}

export function MenuButton({ children, disabled, type }) {
  return (
    <button className='btn primary sm' disabled={disabled} type={type}>
      {children}
    </button>
  )
}

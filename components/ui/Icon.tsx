'use client'

interface IconProps {
  name: string
  size?: number
  stroke?: number
  className?: string
}

export function Icon({ name, size = 16, stroke = 1.6, className = '' }: IconProps) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className,
  }
  switch (name) {
    case 'dashboard':    return <svg {...props}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
    case 'tasks':        return <svg {...props}><path d="M4 6h13"/><path d="M4 12h13"/><path d="M4 18h13"/><circle cx="20" cy="6" r="1.2"/><circle cx="20" cy="12" r="1.2"/><circle cx="20" cy="18" r="1.2"/></svg>
    case 'meetings':     return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4"/><path d="M16 3v4"/></svg>
    case 'notes':        return <svg {...props}><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 10h8"/><path d="M8 14h8"/><path d="M8 18h5"/></svg>
    case 'blog':         return <svg {...props}><path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
    case 'team':         return <svg {...props}><circle cx="9" cy="9" r="3.2"/><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="8" r="2.5"/><path d="M21 18c0-2-1.6-3.5-4-3.5"/></svg>
    case 'settings':     return <svg {...props}><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>
    case 'plus':         return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>
    case 'search':       return <svg {...props}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    case 'sparkle':      return <svg {...props}><path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>
    case 'check':        return <svg {...props}><path d="m4 12 5 5L20 6"/></svg>
    case 'chevron':      return <svg {...props}><path d="m9 6 6 6-6 6"/></svg>
    case 'chev-down':    return <svg {...props}><path d="m6 9 6 6 6-6"/></svg>
    case 'x':            return <svg {...props}><path d="M6 6l12 12M18 6 6 18"/></svg>
    case 'edit':         return <svg {...props}><path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m13 7 4 4"/></svg>
    case 'trash':        return <svg {...props}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/></svg>
    case 'send':         return <svg {...props}><path d="m4 20 17-8L4 4l4 8-4 8Z"/><path d="M8 12h13"/></svg>
    case 'refresh':      return <svg {...props}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
    case 'globe':        return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a13 13 0 0 1 0 18"/><path d="M12 3a13 13 0 0 0 0 18"/></svg>
    case 'upload':       return <svg {...props}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 20h16"/></svg>
    case 'doc':          return <svg {...props}><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M15 3v5h5"/></svg>
    case 'calendar':     return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/></svg>
    case 'flag':         return <svg {...props}><path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/></svg>
    case 'filter':       return <svg {...props}><path d="M3 5h18l-7 9v6l-4-2v-4z"/></svg>
    case 'eye':          return <svg {...props}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
    case 'copy':         return <svg {...props}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>
    case 'arrow-r':      return <svg {...props}><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
    case 'circle':       return <svg {...props}><circle cx="12" cy="12" r="9"/></svg>
    case 'check-circle': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>
    case 'lightning':    return <svg {...props}><path d="M13 3 4 14h7l-1 7 9-11h-7l1-7z"/></svg>
    case 'tag':          return <svg {...props}><path d="M3 12 12 3h8v8l-9 9z"/><circle cx="16" cy="8" r="1.2"/></svg>
    case 'key':          return <svg {...props}><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
    case 'lock':         return <svg {...props}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
    case 'user':         return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
    case 'mail':         return <svg {...props}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
    case 'more':         return <svg {...props}><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>
    case 'arrow-up':     return <svg {...props}><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
    case 'arrow-down':   return <svg {...props}><path d="M12 5v14"/><path d="m5 12 7 7 7-7"/></svg>
    case 'agent':        return <svg {...props}><rect x="4" y="9" width="16" height="12" rx="3"/><path d="M8 9V7a4 4 0 0 1 8 0v2"/><circle cx="9" cy="15" r="1.5"/><circle cx="15" cy="15" r="1.5"/><path d="M9 19h6"/></svg>
    case 'play':         return <svg {...props}><polygon points="5 3 19 12 5 21 5 3"/></svg>
    case 'chart-bar':    return <svg {...props}><path d="M3 20h18"/><rect x="4" y="12" width="3" height="8"/><rect x="10.5" y="6" width="3" height="14"/><rect x="17" y="3" width="3" height="17"/></svg>
    case 'chart-line':   return <svg {...props}><path d="M3 20h18"/><path d="M3 20 8 13l4 3 4-7 5 4"/></svg>
    case 'users':        return <svg {...props}><circle cx="8" cy="8" r="3.2"/><path d="M2 20c0-3 2.5-5 6-5s6 2 6 5"/><circle cx="17" cy="7" r="2.5"/><path d="M22 19c0-2-1.6-3.5-4-3.5"/></svg>
    case 'menu':         return <svg {...props}><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    default: return null
  }
}

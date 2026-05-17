/* Tool SVG icons */
function FolderIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>; }
function TypeIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>; }
function SmileIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>; }
function WandIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.2 19 13"/><path d="M15 11h0"/><path d="M17.8 6.8 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.8 11 5"/></svg>; }
function MusicIcon() { return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>; }

const tools = [
  { id: 'media', icon: FolderIcon, label: 'Media' },
  { id: 'text', icon: TypeIcon, label: 'Text' },
  { id: 'stickers', icon: SmileIcon, label: 'Stickers' },
  { id: 'effects', icon: WandIcon, label: 'Effects' },
  { id: 'audio', icon: MusicIcon, label: 'Audio' },
];

interface Props {
  activeTool: string;
  onSetActiveTool: (id: string) => void;
}

export default function LeftSidebar({ activeTool, onSetActiveTool }: Props) {
  return (
    <div className="left-sidebar">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            className={`sidebar-tool-btn ${isActive ? 'active' : ''}`}
            onClick={() => onSetActiveTool(tool.id)}
            title={tool.label}
          >
            <Icon />
            <span className="sidebar-tool-label">{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}

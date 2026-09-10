import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { definePluginApp, experimental_useSidebarThreads, useBbNavigate, useRpc } from '@get-bb/plugin-sdk/app';
import * as Dialog from '@radix-ui/react-dialog';
import { Icon } from './components/ui/icon';
import type { rpcContract } from './server';
import { buildCatalog, prepareIndex, searchIndex, type CatalogEntry, type SearchItem } from './search';
import { isSpotlightShortcut } from './shortcut';
import './app.css';

const OPEN_EVENT = 'bb-spotlight:open';

export function Spotlight() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const sidebar = experimental_useSidebarThreads();
  const projectPreview = useMemo(() => buildCatalog(sidebar.projects, []), [sidebar.projects]);
  const index = useMemo(() => prepareIndex(catalog ?? projectPreview), [catalog, projectPreview]);
  const groups = useMemo(() => {
    const matches = searchIndex(index, query);
    return catalog === null ? matches.filter(group => group.name === 'Projects') : matches;
  }, [index, query, catalog]);
  const loading = catalog === null && !error;
  const cachedCatalog = useRef<CatalogEntry[] | null>(null);
  const pendingCatalog = useRef<Promise<{ entries: CatalogEntry[] }> | null>(null);
  const loadCatalog = useCallback(() => {
    if (!pendingCatalog.current) {
      pendingCatalog.current = rpc.call('catalog').then(result => {
        cachedCatalog.current = result.entries;
        return result;
      }).finally(() => { pendingCatalog.current = null; });
    }
    return pendingCatalog.current;
  }, [rpc]);
  const input = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  const items = groups.flatMap(group => group.items);
  const selected = items.find(item => `${item.kind}:${item.id}` === activeId) ?? items[0];
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const optionId = (item: SearchItem) => `${id}-${item.kind}-${item.id}`;

  useEffect(() => {
    const show = () => {
      if (open) { input.current?.focus(); return; }
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery(''); setActiveId(null); setError(false); setOpen(true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!isSpotlightShortcut(event, navigator.platform)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (open) setOpen(false); else show();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, [open]);

  useEffect(() => {
    // Preload on mount, refresh on open, and poll only while open. Query edits
    // never start requests or discard the snapshot currently being searched.
    if (!open && cachedCatalog.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (cachedCatalog.current) setCatalog(cachedCatalog.current);
    setError(false);
    const refresh = async () => {
      try {
        const result = await loadCatalog();
        if (cancelled) return;
        setCatalog(result.entries); setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled && open) timer = setTimeout(refresh, 5000);
    };
    void refresh();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, retry, loadCatalog]);

  useEffect(() => {
    if (open && selected) document.getElementById(optionId(selected))?.scrollIntoView({ block: 'nearest' });
  }, [open, selected?.id, selected?.kind]);

  function select(item: SearchItem) {
    setOpen(false);
    if (item.kind === 'project') navigate.toProject(item.id);
    else navigate.toThread(item.id);
  }

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Portal>
      <Dialog.Overlay className="spotlight-backdrop" />
      <Dialog.Content className="spotlight-dialog" aria-describedby={`${id}-description`}
        onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus(); }}
        onCloseAutoFocus={event => { event.preventDefault(); if (previousFocus.current?.isConnected) previousFocus.current.focus(); }}>
        <Dialog.Title className="spotlight-sr-only">Spotlight search</Dialog.Title>
        <Dialog.Description id={`${id}-description`} className="spotlight-sr-only">Search projects and threads. Use arrow keys to choose a result and Enter to open it.</Dialog.Description>
        <div className="spotlight-search">
          <Icon name="Search" className="spotlight-icon" />
          <input ref={input} value={query} maxLength={200} placeholder="Search projects and threads…" aria-label="Search projects and threads"
            role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`}
            aria-activedescendant={selected ? optionId(selected) : undefined}
            onChange={event => { setQuery(event.target.value); setActiveId(null); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || (loading && items.length === 0)) return;
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!items.length) return;
                const next = items[(selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]!;
                setActiveId(`${next.kind}:${next.id}`);
              } else if (event.key === 'Enter' && selected) { event.preventDefault(); select(selected); }
            }} />
          <Dialog.Close className="spotlight-close" aria-label="Close Spotlight"><Icon name="X" className="spotlight-icon" /></Dialog.Close>
        </div>
        <div className="spotlight-results" id={`${id}-results`} role="listbox" aria-label="Search results" aria-busy={loading}>
          {groups.map(group => <div role="group" aria-label={group.name} key={group.name} className="spotlight-group">
            <div className="spotlight-group-heading" aria-hidden="true"><span>{group.name}</span><span>{group.total}</span></div>
            {group.items.length === 0 ? <p className="spotlight-empty">No {group.name.toLowerCase()} {query ? 'match' : 'yet'}</p> : group.items.map(item =>
              <div key={`${item.kind}:${item.id}`} id={optionId(item)} role="option" aria-selected={selected === item}
                className="spotlight-result" onMouseMove={() => setActiveId(`${item.kind}:${item.id}`)}
                onMouseDown={event => event.preventDefault()} onClick={() => select(item)}>
                <Icon name={item.kind === 'project' ? 'Folder' : group.name === 'Settled threads' ? 'Archive' : 'MessageSquare'} className="spotlight-icon" />
                <span className="spotlight-result-copy"><span className="spotlight-title">{item.title}</span><span className="spotlight-detail">{item.detail}</span></span>
                <Icon name="ArrowRight" className="spotlight-result-arrow" />
              </div>)}
            {group.total > group.items.length && <p className="spotlight-empty">Showing {group.items.length} of {group.total}. Refine your search to see more.</p>}
          </div>)}
        </div>
        {loading && <p className="spotlight-status" role="status">{groups.length ? 'Searching threads…' : 'Searching…'}</p>}
        {error && <div className="spotlight-status" role="alert">Search couldn’t load. <button className="spotlight-retry" onClick={() => setRetry(value => value + 1)}>Try again</button></div>}
        <div className="spotlight-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
        <span className="spotlight-sr-only" role="status">{!loading && !error ? `${groups.reduce((sum, group) => sum + group.total, 0)} results` : ''}</span>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export default definePluginApp(app => {
  app.slots.experimental_appOverlay({ id: 'spotlight', component: Spotlight });
  app.experimental_sidebarFooter.register({ id: 'spotlight', kind: 'action', label: 'Spotlight search', icon: 'Search',
    onActivate: () => { window.dispatchEvent(new Event(OPEN_EVENT)); },
  });
});

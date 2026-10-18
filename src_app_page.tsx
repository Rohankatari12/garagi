'use client';

import Image from 'next/image';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChartNoAxesColumnIncreasing, Film, FileText, Gamepad2, Home as HomeIcon, Layers, ListMusic, Menu, Palette, Plus, Trash2, Tv } from 'lucide-react';
import { supabase, supabaseConfigured, usernameEmail } from '../lib/supabase';

type Category = 'Anime' | 'Manga' | 'Manhwa' | 'Visual Novels' | 'Web Novels' | 'Shows';
type Status = 'Watching' | 'Reading' | 'Completed' | 'On Hold' | 'Dropped' | 'Plan to Watch' | 'Revisiting';
type PlaylistCategory = Category | 'Mixed';
type Media = { id: string; sourceId: string; source: string; type: Category; title: string; year: string; image: string; customCover?: string; bookmarked?: boolean; bookmarkTag?: string; genres: string[]; description: string; total: number | null; status: Status; rating: number; progress: number; addedBy: string; addedAt?: number; updatedAt?: number; nativeTitle?: string; studio?: string; author?: string; releaseDate?: string; popularity?: number | null; averageScore?: number | null };
type SearchResult = Omit<Media, 'status' | 'rating' | 'progress' | 'addedBy'>;
type Playlist = { id: string; title: string; description: string; category: PlaylistCategory; coverImage: string; createdAt: number; itemIds: string[] };
type Theme = { background:string; opacity:number; blur:number; fit:'cover'|'center'|'stretch'; tone:string; accent:string };
const categories: Category[] = ['Anime', 'Manga', 'Manhwa', 'Visual Novels', 'Web Novels', 'Shows'];
const statuses: Status[] = ['Watching', 'Reading', 'Completed', 'On Hold', 'Dropped', 'Plan to Watch', 'Revisiting'];
function normalizeLibraryItems(value: unknown): Media[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Media => Boolean(item && typeof item === 'object'))
    // Remove the starter fixtures from earlier versions while preserving real entries.
    .filter(item => item.source !== 'seed' && !String(item.id || '').startsWith('seed-'))
    .map(item => item.type === ('show' as Category) ? { ...item, type: 'Shows' as Category } : item);
}
const imageFallback = 'https://placehold.co/320x460/20242e/9a9eab?text=No+cover';
const searchCache = new Map<string, { savedAt: number; data: any }>();
const SEARCH_CACHE_TTL = 5 * 60_000;
const SEARCH_CACHE_LIMIT = 100;
function useDebounce<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
}
async function cachedJson<T>(key: string, input: RequestInfo | URL, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.savedAt < SEARCH_CACHE_TTL) return cached.data as T;
  if (cached) searchCache.delete(key);
  const response = await fetch(input, { ...init, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Catalog search failed.');
  searchCache.set(key, { savedAt: Date.now(), data });
  if (searchCache.size > SEARCH_CACHE_LIMIT) searchCache.delete(searchCache.keys().next().value!);
  return data as T;
}
const defaultTheme:Theme={background:'',opacity:20,blur:0,fit:'cover',tone:'#090b10',accent:'#d3f36b'};
function readSavedTheme():Theme {
  if(typeof window==='undefined')return defaultTheme;
  try{return {...defaultTheme,...JSON.parse(localStorage.getItem('sidequest-theme')||'{}')}}catch{return defaultTheme}
}
function applyTheme(theme:Theme) {
  const root=document.documentElement;
  root.setAttribute('data-theme','custom');
  root.style.setProperty('--bg',theme.tone);
  root.style.setProperty('--theme-base',theme.tone);
  root.style.setProperty('--theme-accent',theme.accent);
  root.style.setProperty('--lime',theme.accent);
  const background=theme.background?.trim();
  root.style.setProperty('--theme-background',background?`url(${JSON.stringify(background)})`:'none');
  root.style.setProperty('--theme-opacity',String(theme.opacity/100));
  root.style.setProperty('--theme-blur',`${theme.blur}px`);
  root.style.setProperty('--theme-fit',theme.fit==='stretch'?'100% 100%':theme.fit==='center'?'auto':'cover');
}
const tones=[{name:'Deep dark',value:'#090b10'},{name:'Pure black',value:'#030303'},{name:'Midnight',value:'#030712'},{name:'Dark purple',value:'#100817'}];
const accents=[{name:'Neon green',value:'#d3f36b'},{name:'Violet',value:'#a98dff'},{name:'Cyber cyan',value:'#69e6ed'},{name:'Sunset amber',value:'#f1a85f'},{name:'Electric pink',value:'#f078b8'}];
const CoverFallback = memo(function CoverFallback({title,type}:{title:string;type:string}) { return <div className="poster-fallback" aria-label={`${title} cover unavailable`}><span>{type}</span><strong>{title}</strong><i>✳ GATARI</i></div>; });
const MediaImage = memo(function MediaImage({src,alt='',className='',sizes='(max-width: 600px) 45vw, 220px',onError}:{src:string;alt?:string;className?:string;sizes?:string;onError?:(event:React.SyntheticEvent<HTMLImageElement>)=>void}) {
  const source=src||imageFallback;
  const custom = source.startsWith('data:') || source.startsWith('blob:');
  const configuredHost = source.startsWith('/') || ['s4.anilist.co','image.tmdb.org','t.vndb.org','media.kitsu.io','placehold.co'].some(host=>source.includes(`://${host}/`)) || source.includes('.comick.pictures/');
  return <Image src={source} alt={alt} className={className} width={400} height={560} sizes={sizes} quality={75} loading="lazy" unoptimized={custom||!configuredHost} onError={onError}/>;
});
const SearchResultGrid = memo(function SearchResultGrid({results,addedKeys,onOpen,onAdd}:{results:SearchResult[];addedKeys:Set<string>;onOpen:(item:SearchResult)=>void;onAdd:(item:SearchResult)=>void}) {
  const [visibleCount,setVisibleCount]=useState(3);
  useEffect(()=>setVisibleCount(3),[results]);
  const visible=results.slice(0,visibleCount);
  return <><div className="results-grid">{visible.map(result=>{const added=addedKeys.has(`${result.type}:${result.sourceId}`);return <article key={result.id} className="result-card result-clickable" role="button" tabIndex={0} onClick={()=>onOpen(result)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen(result)}}}><MediaImage src={result.image||imageFallback} sizes="64px" alt=""/><div className="result-info"><b>{result.title}</b><div className="result-meta"><span>{result.year||'Year unknown'}{result.genres.length?` · ${result.genres.slice(0,2).join(', ')}`:''}</span><i>{result.type}</i></div></div><button type="button" className={`result-add-button ${added?'is-added':''}`} aria-label={added?`Open ${result.title} details`:`Add ${result.title} and open details`} title={added?'Open details':'Add and view details'} onClick={event=>{event.stopPropagation();onAdd(result)}}>{added?<Check size={17}/>:<Plus size={17}/>}</button></article>})}</div>{results.length>3&&<button type="button" className="search-show-more" onClick={()=>setVisibleCount(count=>count>=results.length?3:Math.min(count+3,results.length))}>{visibleCount>=results.length?'Show Less':`Show More (+${Math.min(3,results.length-visibleCount)})`}</button>}</>;
});
const HomeSearchResultGrid = memo(function HomeSearchResultGrid({results,onAdd}:{results:SearchResult[];onAdd:(item:SearchResult)=>void}) {
  return <div className="home-results-grid">{results.map(result=><article className="home-result-card" key={result.id}><MediaImage src={result.image||imageFallback} sizes="64px" alt=""/><div><b>{result.title}</b><span>{result.type} · {result.year||'Year unknown'} · {result.genres.slice(0,2).join(', ')}</span></div><button onClick={()=>onAdd(result)}>＋ Add</button></article>)}</div>;
});
const MediaCard = memo(function MediaCard({item,onOpen,onAdd,onRemove}:{item:Media;onOpen:(id:string)=>void;onAdd:(id:string)=>void;onRemove:(id:string)=>void}) {
  const [failed,setFailed]=useState(false);
  const cover=item.customCover||item.image;
  useEffect(()=>setFailed(false),[cover]);
  return <article className="media-card" role="button" tabIndex={0} aria-label={`View details for ${item.title}`} onClick={()=>onOpen(item.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen(item.id)}}}><div className="poster-wrap">{cover&&!failed?<MediaImage className="poster" src={cover} sizes="(max-width: 600px) 44vw, (max-width: 1000px) 28vw, 220px" onError={()=>setFailed(true)} alt={`${item.title} poster`}/>:<CoverFallback title={item.title} type={item.type}/>}<div className="poster-top-overlay"><span className="progress-badge">{item.progress}{item.total?` / ${item.total}`:''} {item.type==='Anime'||item.type==='Shows'?'eps':'ch'}</span><span className={`status-pill status-${item.status.toLowerCase().replaceAll(' ','-')}`}>{item.status}</span></div><div className="poster-bottom-overlay"><span className="type-chip">{item.type}</span><span className="rating-badge">{item.rating?`★ ${item.rating}`:'☆ —'}</span><span className="popularity-badge">◉ {item.popularity ? Number(item.popularity).toLocaleString() : '—'}</span></div><span className={`added-avatar card-avatar ${item.addedBy==='Mira'?'mira':''}`} title={`Added by ${item.addedBy}`}>{item.addedBy==='Mira'?'M':'Y'}</span><button type="button" className="media-card-delete" aria-label={`Remove ${item.title} from library`} title="Remove from library" onClick={event=>{event.stopPropagation();onRemove(item.id)}}><Trash2 size={15}/></button></div><div className="media-info"><div className="media-title-row"><h3>{item.title}</h3></div><div className="card-meta-row"><div className="card-subtitle">{addedAge(item.addedAt)} · {item.year||'Year unknown'}</div><button className="card-add-playlist" aria-label={`Add ${item.title} to playlists`} onClick={event=>{event.stopPropagation();onAdd(item.id)}}>＋ List</button></div></div></article>;
});

type DropdownOption = { value: string; label: string };
function Dropdown({value, options, onChange, label, className = '', status = false}:{value:string;options:DropdownOption[];onChange:(value:string)=>void;label:string;className?:string;status?:boolean}) {
  const [open,setOpen]=useState(false);
  const [menuPosition,setMenuPosition]=useState<{right:number;width:number;maxHeight:number;above:boolean}|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!open)return;const outside=(event:MouseEvent)=>{const target=event.target as Node;if(root.current?.contains(target)||menuRef.current?.contains(target))return;setOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false)}};document.addEventListener('mousedown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',outside);document.removeEventListener('keydown',escape)}},[open]);
  useLayoutEffect(()=>{
    if(!open)return;
    const positionMenu=()=>{
      const trigger=root.current?.querySelector<HTMLButtonElement>('.dropdown-trigger');
      const menu=menuRef.current;
      if(!trigger||!menu)return;
      const rect=trigger.getBoundingClientRect();
      const viewportHeight=window.innerHeight;
      const viewportWidth=window.innerWidth;
      const surface=root.current?.closest<HTMLElement>('.details-panel,.playlist-modal,.theme-panel,.cover-editor-dialog');
      const surfaceRect=surface?.getBoundingClientRect();
      const minLeft=Math.max(16,surfaceRect?surfaceRect.left+16:0);
      const maxRight=Math.min(viewportWidth-16,surfaceRect?surfaceRect.right-16:viewportWidth);
      const minTop=Math.max(8,surfaceRect?surfaceRect.top+8:0);
      const maxBottom=Math.min(viewportHeight-8,surfaceRect?surfaceRect.bottom-8:viewportHeight);
      const desiredHeight=Math.min(menu.scrollHeight||200,280);
      const spaceBelow=Math.max(0,maxBottom-rect.bottom-8);
      const spaceAbove=Math.max(0,rect.top-minTop-8);
      const inDetailsFooter=Boolean(status&&surface?.classList.contains('details-panel'));
      const above=inDetailsFooter||(spaceBelow<Math.min(200,desiredHeight)&&spaceAbove>spaceBelow);
      const width=Math.min(224,Math.max(190,rect.width),Math.max(1,maxRight-minLeft));
      const left=Math.max(minLeft,Math.min(rect.right-width,maxRight-width));
      const maxHeight=Math.max(48,Math.min(280,above?spaceAbove:spaceBelow));
      // Keep the popup's measured width and CSS width identical. A negative
      // right offset is intentional when a trigger is near the left edge.
      const right=rect.right-(left+width);
      setMenuPosition({right,width,maxHeight,above});
    };
    positionMenu();
    window.addEventListener('resize',positionMenu);
    window.addEventListener('scroll',positionMenu,true);
    return()=>{window.removeEventListener('resize',positionMenu);window.removeEventListener('scroll',positionMenu,true)};
  },[open]);
  useEffect(()=>{if(!open)setMenuPosition(null)},[open]);
  const selected=options.find(option=>option.value===value)||options[0];
  const icons:Record<string,string>={'Plan to Watch':'◉','Completed':'✓','On Hold':'Ⅱ','Dropped':'×','Revisiting':'↻','Watching':'▶','Reading':'▤'};
  return <div className={`custom-dropdown ${status?'status-dropdown':''} ${className}`} ref={root}>
    <button type="button" className="dropdown-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={()=>setOpen(current=>!current)}>
      {status&&<span className={`dropdown-status-icon status-${value.toLowerCase().replaceAll(' ','-')}`} aria-hidden="true">{icons[value]||'◉'}</span>}
      <span className="dropdown-value">{selected?.label||value}</span><span className="dropdown-chevron" aria-hidden="true">⌄</span>
    </button>
    {open&&<div ref={menuRef} className={`dropdown-menu ${menuPosition?.above?'dropdown-menu-above':''}`} role="listbox" aria-label={label} style={{right:menuPosition?.right??0,width:menuPosition?.width??224,maxHeight:menuPosition?.maxHeight??280,zIndex:150,visibility:menuPosition?'visible':'hidden'}}>{options.map(option=><button type="button" role="option" aria-selected={option.value===value} className={`dropdown-option ${option.value===value?'selected':''}`} key={option.value} onClick={()=>{onChange(option.value);setOpen(false)}}>{status&&<span className={`dropdown-status-icon status-${option.value.toLowerCase().replaceAll(' ','-')}`} aria-hidden="true">{icons[option.value]||'◉'}</span>}<span>{option.label}</span>{option.value===value&&<span className="dropdown-check" aria-hidden="true">✓</span>}</button>)}</div>}
  </div>;
}

function anilistType(category: Category) { return category === 'Anime' ? 'ANIME' : 'MANGA'; }
function addedAge(timestamp?: number) { if (!timestamp) return 'Added recently'; const minutes=Math.max(1,Math.floor((Date.now()-timestamp)/60000)); if(minutes<60)return `Added ${minutes}m ago`; const hours=Math.floor(minutes/60); if(hours<24)return `Added ${hours}h ago`; const days=Math.floor(hours/24); return `Added ${days}d ago`; }
function cleanDescription(value:string) {
  return (value||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p\s*>/gi,'\n\n').replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#0?39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
function normalizeAni(item: any, category: Category): SearchResult {
  const title = item.title?.english || item.title?.romaji || item.title?.native || 'Untitled';
  return { id:`anilist-${item.id}-${category}`, sourceId:String(item.id), source:'anilist', type:category, title, nativeTitle:item.title?.native, year:item.startDate?.year ? String(item.startDate.year) : '', image:item.coverImage?.large || item.coverImage?.medium || '', genres:item.genres ?? [], description:cleanDescription(item.description ?? ''), total:item.episodes ?? item.chapters ?? null, popularity:item.popularity ?? null };
}

export default function Home() {
  const [active, setActive] = useState<Category | 'Stats' | 'Playlists' | 'Home'>('Home');
  const [categorySection, setCategorySection] = useState<'Items' | 'Playlists'>('Items');
  const [items, setItems] = useState<Media[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login'|'signup'|null>(null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const cloudSnapshot = useRef('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [genre, setGenre] = useState('All genres');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [sort, setSort] = useState('Recently added');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [playlistModal, setPlaylistModal] = useState(false);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist|null>(null);
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [playlistCover, setPlaylistCover] = useState('');
  const [playlistDraftCategory, setPlaylistDraftCategory] = useState<PlaylistCategory>('Mixed');
  const [hubPlaylistFilter, setHubPlaylistFilter] = useState('All');
  const [playlistSearch, setPlaylistSearch] = useState('');
  const [playlistSort, setPlaylistSort] = useState('Recently added');
  const [playlistCategory, setPlaylistCategory] = useState('All categories');
  const [playlistGenre, setPlaylistGenre] = useState('All genres');
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailPreviewItem, setDetailPreviewItem] = useState<Media | null>(null);
  const [detailDraftIsNew, setDetailDraftIsNew] = useState(false);
  const [progressDraft, setProgressDraft] = useState('0');
  const [ratingDraft, setRatingDraft] = useState('');
  const [ratingSelectorOpen, setRatingSelectorOpen] = useState(false);
  const [detailMoreOpen, setDetailMoreOpen] = useState(false);
  const detailMoreRef = useRef<HTMLDivElement>(null);
  const [coverEditorOpen, setCoverEditorOpen] = useState(false);
  const [detailExtra, setDetailExtra] = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});
  const [coverUrlDraft, setCoverUrlDraft] = useState('');
  const [playlistPickerItem, setPlaylistPickerItem] = useState<Media | null>(null);
  const [playlistPickerSelection, setPlaylistPickerSelection] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState('');
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [themeUrlDraft, setThemeUrlDraft] = useState('');
  const [homeQuery, setHomeQuery] = useState('');
  const debouncedQuery = useDebounce(query, 350);
  const debouncedHomeQuery = useDebounce(homeQuery, 350);
  const [homeResults, setHomeResults] = useState<SearchResult[]>([]);
  const [homeFilter, setHomeFilter] = useState('All');
  const [homeSearching, setHomeSearching] = useState(false);
  const [homeSearchError, setHomeSearchError] = useState('');
  const [randomPick, setRandomPick] = useState<Media | null>(null);
  const categorySearchToken=useRef(0);
  const homeSearchToken=useRef(0);
  const categorySearchAbort=useRef<AbortController|null>(null);
  const homeSearchAbort=useRef<AbortController|null>(null);
  const searchActions=useRef<{open:(result:SearchResult)=>void;add:(result:SearchResult)=>void;track:(result:SearchResult)=>void}>({open:()=>{},add:()=>{},track:()=>{}});
  const dispatchOpenResult=useMemo(()=> (result:SearchResult)=>searchActions.current.open(result),[]);
  const dispatchAddResult=useMemo(()=> (result:SearchResult)=>searchActions.current.add(result),[]);
  const dispatchTrackResult=useMemo(()=> (result:SearchResult)=>searchActions.current.track(result),[]);
  const mediaActions=useRef<{open:(id:string)=>void;add:(id:string)=>void;remove:(id:string)=>void}>({open:()=>{},add:()=>{},remove:()=>{}});
  const dispatchOpenMedia=useMemo(()=> (id:string)=>mediaActions.current.open(id),[]);
  const dispatchAddMedia=useMemo(()=> (id:string)=>mediaActions.current.add(id),[]);
  const dispatchRemoveMedia=useMemo(()=> (id:string)=>mediaActions.current.remove(id),[]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sidequest-media');
      // No saved library (or an invalid value) means a clean, empty dashboard.
      setItems(normalizeLibraryItems(saved ? JSON.parse(saved) : []));
    } catch {
      setItems([]);
    }
    try {
      const savedPlaylists = localStorage.getItem('sidequest-playlists');
      const parsedPlaylists = savedPlaylists ? JSON.parse(savedPlaylists) : [];
      setPlaylists(Array.isArray(parsedPlaylists) ? parsedPlaylists.map((playlist: Playlist) => ({...playlist, category:playlist.category || 'Mixed'})) : []);
    } catch { setPlaylists([]); }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated && authReady && !authUser) localStorage.setItem('sidequest-media', JSON.stringify(items)); }, [items, hydrated, authReady, authUser?.id]);
  useEffect(() => { if (hydrated && authReady && !authUser) localStorage.setItem('sidequest-playlists', JSON.stringify(playlists)); }, [playlists, hydrated, authReady, authUser?.id]);
  useEffect(() => { if (hydrated && authReady) localStorage.setItem('sidequest-theme', JSON.stringify(theme)); }, [theme, hydrated, authReady]);
  useLayoutEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => {
    if (!hydrated) return;
    if (!supabase) { setAuthReady(true); return; }
    let alive = true;
    supabase.auth.getSession().then(({data}) => { if (alive) { setAuthUser(data.session?.user ?? null); setAuthReady(true); } });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, session) => { if (alive) setAuthUser(session?.user ?? null); });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [hydrated]);
  useEffect(() => {
    if (!authReady) return;
    if (!supabase || !authUser) { setCloudReady(false); return; }
    let alive = true;
    setCloudReady(false);
    setItems([]); setPlaylists([]); setTheme(defaultTheme);
    (async () => {
      const {data, error} = await supabase!.from('user_state').select('media_items,playlists,appearance').eq('user_id',authUser.id).maybeSingle();
      if (!alive) return;
      if (error) { setToastMessage('Cloud sync unavailable. Check your Supabase schema.'); }
      const nextItems = normalizeLibraryItems(data?.media_items);
      const nextPlaylists = Array.isArray(data?.playlists) ? data.playlists : [];
      const nextTheme = {...defaultTheme,...(data?.appearance||{})};
      setItems(nextItems); setPlaylists(nextPlaylists); setTheme(nextTheme);
      // Keep the raw cloud snapshot for comparison so legacy starter fixtures
      // are automatically replaced by the cleaned library on the next sync.
      cloudSnapshot.current = JSON.stringify({items:Array.isArray(data?.media_items)?data.media_items:[],playlists:nextPlaylists,theme:nextTheme});
      setCloudReady(true);
    })();
    return () => { alive = false; };
  }, [authUser?.id, authReady]);
  useEffect(() => {
    if (!supabase || !authUser || !cloudReady) return;
    const payload = {items,playlists,theme};
    const serialized = JSON.stringify(payload);
    if (serialized === cloudSnapshot.current) return;
    const timer = window.setTimeout(async () => {
      const {error} = await supabase!.from('user_state').upsert({user_id:authUser.id,media_items:items,playlists,appearance:theme,updated_at:new Date().toISOString()},{onConflict:'user_id'});
      if (error) setToastMessage('Could not sync changes. Check your connection.');
      else cloudSnapshot.current = serialized;
    },500);
    return () => window.clearTimeout(timer);
  }, [items,playlists,theme,authUser?.id,cloudReady]);
  useEffect(() => {
    if (!supabase || !authUser || !cloudReady) return;
    const channel = supabase.channel(`user-state-${authUser.id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'user_state',filter:`user_id=eq.${authUser.id}`},payload=>{
      const row:any=payload.new; const next={items:normalizeLibraryItems(row.media_items),playlists:row.playlists||[],theme:{...defaultTheme,...(row.appearance||{})}};
      const serialized=JSON.stringify(next); if(serialized===cloudSnapshot.current)return;
      cloudSnapshot.current=serialized;setItems(next.items);setPlaylists(next.playlists);setTheme(next.theme);
    }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
  },[authUser?.id,cloudReady]);
  useEffect(() => { if (!toastMessage) return; const timer=window.setTimeout(()=>setToastMessage(''),4000); return()=>window.clearTimeout(timer); },[toastMessage]);
  useEffect(() => { if(!detailMoreOpen)return;const outside=(event:MouseEvent)=>{if(detailMoreRef.current&&!detailMoreRef.current.contains(event.target as Node)){setDetailMoreOpen(false);setRatingSelectorOpen(false)}};document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside);},[detailMoreOpen]);
  useEffect(() => {
    if (!detailItemId && !detailPreviewItem && !playlistPickerItem && !playlistModal && !coverEditorOpen && !themePanelOpen) return;
    const onEscape=(event:KeyboardEvent)=>{if(event.key!=='Escape')return;if(themePanelOpen){setThemePanelOpen(false);return;}if(playlistModal){setPlaylistModal(false);return;}if(playlistPickerItem){setPlaylistPickerItem(null);return;}if(coverEditorOpen){setCoverEditorOpen(false);return;}if(detailMoreOpen){setDetailMoreOpen(false);setRatingSelectorOpen(false);return;}closeDetails();};
    window.addEventListener('keydown',onEscape);return()=>window.removeEventListener('keydown',onEscape);
  },[detailItemId,detailPreviewItem,playlistPickerItem,playlistModal,coverEditorOpen,themePanelOpen,detailMoreOpen]);
  const visibleItems = useMemo(() => {
    let list = items.filter(x => x.type === active);
    if (genre !== 'All genres') list = list.filter(x => x.genres.includes(genre));
    if (statusFilter !== 'All statuses') list = list.filter(x => x.status === statusFilter);
    if (sort === 'Rating: high to low') list = [...list].sort((a,b) => b.rating-a.rating);
    else if (sort === 'Title: A to Z') list = [...list].sort((a,b) => a.title.localeCompare(b.title));
    return list;
  }, [items, active, genre, statusFilter, sort]);
  const allGenres = useMemo(() => [...new Set(items.flatMap(x => x.genres))].sort(), [items]);
  const addedResultKeys = useMemo(() => new Set(items.map(item=>`${item.type}:${item.sourceId}`)), [items]);
  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId) ?? null;
  const detailItem = detailPreviewItem ?? items.find(item => item.id === detailItemId) ?? null;
  useEffect(()=>{if(detailItem){setProgressDraft(String(detailItem.progress));setRatingDraft(detailItem.rating?String(detailItem.rating):'')}},[detailItem?.id,detailItem?.progress,detailItem?.rating]);
  const detailIsTracked = detailItem ? items.some(item=>item.id===detailItem.id||(item.sourceId===detailItem.sourceId&&item.type===detailItem.type)) : false;
  const categoryFeature = categories.includes(active as Category) ? items.find(item=>item.type===active&&item.image) : undefined;
  const visibleHomeResults=homeResults.filter(item=>homeFilter==='All'||item.type===homeFilter);
  const continueItems=items.filter(item=>item.status==='Watching'||item.status==='Reading').slice(0,12);
  const recentItems=[...items].sort((a,b)=>(b.updatedAt||b.addedAt||0)-(a.updatedAt||a.addedAt||0)).slice(0,6);
  const topRated=items.filter(item=>item.rating>0).sort((a,b)=>b.rating-a.rating)[0];
  const watchHours=Math.round(items.filter(item=>item.type==='Anime'||item.type==='Shows').reduce((sum,item)=>sum+item.progress*.4,0));
  const chaptersRead=items.filter(item=>item.type==='Manga'||item.type==='Manhwa'||item.type==='Visual Novels'||item.type==='Web Novels').reduce((sum,item)=>sum+item.progress,0);
  const categoryPlaylists = active !== 'Stats' && active !== 'Playlists' ? playlists.filter(playlist => playlist.category === active) : [];
  const hubPlaylists = playlists.filter(playlist => hubPlaylistFilter === 'All' || playlist.category === hubPlaylistFilter);
  const playlistMedia = useMemo(() => {
    if (!selectedPlaylist) return [];
    return selectedPlaylist.itemIds.map(id => items.find(item => item.id === id)).filter((item): item is Media => Boolean(item));
  }, [selectedPlaylist, items]);
  const visiblePlaylistMedia = useMemo(() => {
    let list = playlistMedia.filter(item => item.title.toLowerCase().includes(playlistSearch.trim().toLowerCase()));
    if (playlistCategory !== 'All categories') list = list.filter(item => item.type === playlistCategory);
    if (playlistGenre !== 'All genres') list = list.filter(item => item.genres.includes(playlistGenre));
    if (playlistSort === 'Oldest added') list.reverse();
    else if (playlistSort === 'Title: A to Z') list.sort((a,b) => a.title.localeCompare(b.title));
    else if (playlistSort === 'Rating: high to low') list.sort((a,b) => b.rating-a.rating);
    return list;
  }, [playlistMedia, playlistSearch, playlistCategory, playlistGenre, playlistSort]);
  const donutBackground = useMemo(() => {
    const colors = ['#d3f36b','#a98dff','#ef86b9','#82bbf7','#f1a875','#62656e'];
    const counts = categories.map(category => items.filter(item => item.type === category).length);
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (!total) return 'conic-gradient(#35363d 0 100%)';
    let stop = 0;
    return `conic-gradient(${counts.map((count, i) => { const start = stop; stop += count / total * 100; return `${colors[i]} ${start}% ${stop}%`; }).join(',')})`;
  }, [items]);
  const stats = useMemo(() => {
    const rated = items.filter(x => x.rating > 0);
    return { total:items.length, genres:allGenres.map(name => ({ name, count:items.filter(x => x.genres.includes(name)).length })).sort((a,b) => b.count-a.count).slice(0,6), scores:Array.from({length:10},(_,i)=>({score:10-i,count:rated.filter(x=>x.rating===10-i).length})), statuses:statuses.map(status=>({status,count:items.filter(x=>x.status===status).length})).filter(x=>x.count>0) };
  }, [items, allGenres]);

  async function search(searchText=query, category=active, signal?:AbortSignal) {
    const text = searchText.trim(); if (text.length < 2 || !categories.includes(category as Category)) return;
    const token=++categorySearchToken.current;
    setSearching(true); setSearchError(''); setHasSearched(false);
    try {
      let found:SearchResult[]=[];
      if (category === 'Shows') {
        const data=await cachedJson<any>(`tmdb:${text}`,`/api/tmdb?q=${encodeURIComponent(text)}`,{},signal); found=data.results??[];
      } else if (category === 'Visual Novels') {
        const data=await cachedJson<any>(`vndb:${text}`,`/api/vndb?q=${encodeURIComponent(text)}`,{},signal); found=data.results??[];
      } else if (category === 'Web Novels') {
        const data=await cachedJson<any>(`kitsu:${text}`,`/api/kitsu-novels?q=${encodeURIComponent(text)}`,{},signal); found=data.results??[];
      } else if (category === 'Manga' || category === 'Manhwa') {
        const data=await cachedJson<any>(`comick:${category}:${text}`,`/api/comick?q=${encodeURIComponent(text)}&category=${encodeURIComponent(category)}`,{},signal); found=data.results??[];
      } else {
        const queryType = anilistType(category as Category);
        const gql = `query ($search: String!, $type: MediaType!) { Page(perPage: 20) { media(search: $search, type: $type, sort: SEARCH_MATCH) { id title { english romaji native } startDate { year } coverImage { large medium } genres description episodes chapters format popularity averageScore } } }`;
        const body=JSON.stringify({query:gql,variables:{search:text,type:queryType}});
        const data=await cachedJson<any>(`anilist:${body}`,'https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body},signal);
        found=(data.data?.Page?.media??[]).map((item:any)=>normalizeAni(item,category as Category));
      }
      if(token===categorySearchToken.current){setResults(found.slice(0,10));setHasSearched(true);}
    } catch (error) { if(token===categorySearchToken.current&&!signal?.aborted)setSearchError(error instanceof Error ? error.message : 'Search failed.'); }
    finally { if(token===categorySearchToken.current)setSearching(false); }
  }
  async function searchEverything(searchText=homeQuery, signal?:AbortSignal) {
    const text=searchText.trim(); if(text.length<2)return;
    const token=++homeSearchToken.current;setHomeSearching(true);setHomeSearchError('');setHomeFilter('All');
    const runJson=async(path:string,key:string):Promise<SearchResult[]>=>{const payload=await cachedJson<any>(key,path,{},signal);return payload.results||[]};
    const anilist=async():Promise<SearchResult[]>=>{const gql=`query ($search:String!){Page(perPage:12){media(search:$search,type:ANIME,sort:SEARCH_MATCH){id title{english romaji native} startDate{year} coverImage{large medium} genres description episodes chapters popularity averageScore}}}`;const body=JSON.stringify({query:gql,variables:{search:text}});const payload=await cachedJson<any>(`anilist:${body}`,'https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body},signal);return(payload.data?.Page?.media||[]).map((item:any)=>normalizeAni(item,'Anime'))};
    const manga=(category:Category)=>runJson(`/api/comick?q=${encodeURIComponent(text)}&category=${encodeURIComponent(category)}`,`comick:${category}:${text}`);
    const tasks:Promise<SearchResult[]>[]=[anilist(),manga('Manga'),manga('Manhwa'),runJson(`/api/vndb?q=${encodeURIComponent(text)}`,`vndb:${text}`),runJson(`/api/kitsu-novels?q=${encodeURIComponent(text)}`,`kitsu:${text}`),runJson(`/api/tmdb?q=${encodeURIComponent(text)}`,`tmdb:${text}`)];
    const settled=await Promise.allSettled(tasks);const found=settled.flatMap(result=>result.status==='fulfilled'?result.value:[]);
    if(token===homeSearchToken.current&&!signal?.aborted){const limited=found.slice(0,10);setHomeResults(limited);if(!limited.length)setHomeSearchError(settled.every(result=>result.status==='rejected')?'Search catalogs are unavailable right now. Try again in a moment.':'No results found across the connected catalogs.');setHomeSearching(false);}
  }
  useEffect(()=>{
    categorySearchAbort.current?.abort();
    if(query.trim().length<2||query.trim()!==debouncedQuery.trim()||!categories.includes(active as Category)){categorySearchToken.current++;setResults([]);setSearchError('');setHasSearched(false);setSearching(false);return;}
    const controller=new AbortController();categorySearchAbort.current=controller;void search(debouncedQuery,active,controller.signal);
    return()=>controller.abort();
  },[query,debouncedQuery,active]);
  useEffect(()=>{
    homeSearchAbort.current?.abort();
    if(active!=='Home'||homeQuery.trim().length<2||homeQuery.trim()!==debouncedHomeQuery.trim()){homeSearchToken.current++;setHomeResults([]);setHomeSearchError('');setHomeSearching(false);return;}
    const controller=new AbortController();homeSearchAbort.current=controller;void searchEverything(debouncedHomeQuery,controller.signal);
    return()=>controller.abort();
  },[homeQuery,debouncedHomeQuery,active]);
  useEffect(()=>{
    if(!playlistToDelete)return;
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setPlaylistToDelete(null)};
    document.addEventListener('keydown',closeOnEscape);
    return()=>document.removeEventListener('keydown',closeOnEscape);
  },[playlistToDelete]);
  function clearCategorySearch() { categorySearchAbort.current?.abort();categorySearchToken.current++;setQuery('');setResults([]);setSearchError('');setHasSearched(false);setSearching(false); }
  function clearHomeSearch() { homeSearchAbort.current?.abort();homeSearchToken.current++;setHomeQuery('');setHomeResults([]);setHomeSearchError('');setHomeSearching(false); }
  async function openDetails(item: Media, isNewDraft = false) {
    setDetailPreviewItem(item); setDetailItemId(item.id); setDetailDraftIsNew(isNewDraft); setDetailError(''); setDetailLoading(true); setCoverUrlDraft(item.customCover || '');setRatingSelectorOpen(false);setDetailMoreOpen(false);setCoverEditorOpen(false);
    try {
      let data: any = {};
      if (item.source === 'anilist') {
        const gql = `query ($id: Int) { Media(id: $id) { title { native romaji english } description(asHtml: false) genres startDate { year month day } status episodes chapters volumes averageScore popularity studios { nodes { name } } staff(perPage: 5, sort: [RELEVANCE]) { edges { role node { name { full } } } } } }`;
        const response = await fetch('https://graphql.anilist.co', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({query:gql,variables:{id:Number(item.sourceId)}})});
        if (!response.ok) throw new Error('Could not load full AniList details.');
        data = (await response.json()).data?.Media ?? {};
        data.nativeTitle=data.title?.native; data.studio=data.studios?.nodes?.[0]?.name;
        data.author=data.staff?.edges?.find((edge:any)=>/story|original|author/i.test(edge.role))?.node?.name?.full;
        data.releaseDate=data.startDate ? [data.startDate.year,data.startDate.month,data.startDate.day].filter(Boolean).join('-') : '';
        data.total=item.type==='Anime'?data.episodes:data.chapters; data.genres=data.genres;
      } else if (item.source === 'tmdb') {
        const response = await fetch(`/api/tmdb?id=${encodeURIComponent(item.sourceId)}`); const payload=await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load show details.'); data=payload.details || {};
      } else if (item.source === 'vndb') {
        const response = await fetch(`/api/vndb?id=${encodeURIComponent(item.sourceId)}`); const payload=await response.json();
        if (!response.ok) throw new Error(payload.error || 'Could not load visual novel details.'); data=payload.details || {};
      } else if (item.source === 'kitsu') {
        const response=await fetch(`https://kitsu.io/api/edge/manga/${encodeURIComponent(item.sourceId)}?include=categories`);
        if (!response.ok) throw new Error('Could not load Kitsu details.'); const payload=await response.json(); const attrs=payload.data?.attributes||{};
        data={description:attrs.synopsis,releaseDate:attrs.startDate,nativeTitle:attrs.titles?.ja_jp,total:attrs.chapterCount,popularity:attrs.popularityRank?Math.max(0,1000000-attrs.popularityRank):null};
      }
      setDetailExtra(current=>({...current,[item.id]:data}));
    } catch(error) { setDetailError(error instanceof Error?error.message:'Could not load additional details.'); }
    finally { setDetailLoading(false); }
  }
  function openSearchDetails(result:SearchResult) {
    const existing=items.find(item=>item.sourceId===result.sourceId&&item.type===result.type);
    const item:Media=existing||{...result,id:`preview-${result.source}-${result.sourceId}`,status:result.type==='Anime'||result.type==='Shows'?'Plan to Watch':'Reading',rating:0,progress:0,addedBy:'You'};
    void openDetails(item,!existing);
  }
  function closeDetails() { setDetailItemId(null);setDetailPreviewItem(null);setDetailDraftIsNew(false);setRatingSelectorOpen(false);setDetailMoreOpen(false);setCoverEditorOpen(false); }
  function saveAndCloseDetails() {
    if(!detailItem){closeDetails();return;}
    const progressValue=progressDraft.trim()===''?0:Number(progressDraft);
    const progress=Number.isFinite(progressValue)?Math.max(0,Math.floor(progressValue)):detailItem.progress;
    const ratingText=ratingDraft.trim();
    const rating=ratingText===''?0:/^(?:10(?:\.0)?|[0-9](?:\.[0-9])?)$/.test(ratingText)?Number(ratingText):detailItem.rating;
    const existing=items.find(item=>item.id===detailItem.id||(item.sourceId===detailItem.sourceId&&item.type===detailItem.type));
    const committed:Media={...detailItem,id:existing?.id||detailItem.id,progress,rating,addedAt:existing?.addedAt||detailItem.addedAt||Date.now(),addedBy:existing?.addedBy||'You',updatedAt:Date.now()};
    setItems(current=>{
      const match=current.find(item=>item.id===committed.id||(item.sourceId===committed.sourceId&&item.type===committed.type));
      return match?current.map(item=>item.id===match.id?committed:item):[committed,...current];
    });
    setProgressDraft(String(progress));setRatingDraft(rating?String(rating):'');
    setToastMessage(detailDraftIsNew?`Added “${committed.title}” to your library`:`Saved changes to “${committed.title}”`);
    closeDetails();
  }
  function uploadMediaCover(event: React.ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    if(!file)return;
    if(!file.type.startsWith('image/')){window.alert('Choose an image file.');event.target.value='';return;}
    if(file.size>2*1024*1024){window.alert('Choose an image under 2 MB.');event.target.value='';return;}
    const reader=new FileReader();
    reader.onload=()=>{const cover=String(reader.result||'');if(detailItem){updateDetail({customCover:cover});setFailedCovers(current=>({...current,[detailItem.id]:false}));setCoverUrlDraft('');}};
    reader.readAsDataURL(file);event.target.value='';
  }
  function saveMediaCoverUrl() {
    if(!detailItem)return;
    const url=coverUrlDraft.trim();
    if(url && !/^https?:\/\//i.test(url) && !url.startsWith('data:image/')){window.alert('Paste an image URL starting with http:// or https://.');return;}
    updateDetail({customCover:url});
    setFailedCovers(current=>({...current,[detailItem.id]:false}));
  }
  function clearMediaCover() {
    if(!detailItem)return;
    updateDetail({customCover:''});setCoverUrlDraft('');
    setFailedCovers(current=>({...current,[detailItem.id]:false}));
  }
  function add(result: SearchResult) {
    const existing=items.find(x=>x.sourceId===result.sourceId&&x.type===result.type);
    const item=existing||{...result,id:`${result.source}-${result.sourceId}-${Date.now()}`,status:result.type==='Anime'||result.type==='Shows'?'Plan to Watch':'Reading',rating:0,progress:0,addedAt:Date.now(),addedBy:'You'} as Media;
    if(!existing)setItems(current=>[item,...current]);
    openPlaylistPicker(item);
  }
  function trackAndOpen(result:SearchResult) {
    const existing=items.find(item=>item.sourceId===result.sourceId&&item.type===result.type);
    const item=existing||{...result,id:`draft-${result.source}-${result.sourceId}`,status:result.type==='Anime'||result.type==='Shows'?'Plan to Watch':'Reading',rating:0,progress:0,addedBy:'You'} as Media;
    void openDetails(item,!existing);
  }
  function updateItem(id:string, patch:Partial<Media>) { setItems(current => current.map(x=>x.id===id?{...x,...patch,updatedAt:Date.now()}:x)); }
  function removeFromLibrary(mediaId:string) {
    const tracked=items.find(item=>item.id===mediaId);
    if(!tracked)return;
    setItems(current=>current.filter(item=>item.id!==tracked.id));
    setPlaylists(current=>current.map(playlist=>({...playlist,itemIds:playlist.itemIds.filter(id=>id!==tracked.id)})));
    if(detailItem && (detailItem.id===tracked.id || (detailItem.sourceId===tracked.sourceId&&detailItem.type===tracked.type)))closeDetails();
    if(playlistPickerItem?.id===tracked.id)setPlaylistPickerItem(null);
    setToastMessage(`Removed “${tracked.title}” from your library`);
    window.setTimeout(()=>setToastMessage(''),2600);
  }
  function ensureDetailSaved() {
    if(!detailItem)return null;
    const existing=items.find(item=>item.id===detailItem.id||(item.sourceId===detailItem.sourceId&&item.type===detailItem.type));
    if(existing)return existing;
    if(detailDraftIsNew){setToastMessage('Click Done to save this title before adding it to a playlist.');return null;}
    return null;
  }
  function updateDetail(patch:Partial<Media>) {
    if(!detailItem)return;
    const updated={...detailItem,...patch,updatedAt:Date.now()};
    setDetailPreviewItem(updated);setDetailItemId(updated.id);
  }
  function commitProgressDraft() {
    if(!detailItem)return;
    const parsed=progressDraft.trim()===''?0:Number(progressDraft);
    const progress=Number.isFinite(parsed)?Math.max(0,Math.floor(parsed)):detailItem.progress;
    setProgressDraft(String(progress));updateDetail({progress});
  }
  function commitRatingDraft() {
    if(!detailItem)return;
    const value=ratingDraft.trim();
    if(value==='' ){setRatingDraft('');updateDetail({rating:0});return;}
    if(!/^(?:10(?:\.0)?|[0-9](?:\.[0-9])?)$/.test(value)){setRatingDraft(detailItem.rating?String(detailItem.rating):'');return;}
    const rating=Number(value);setRatingDraft(String(rating));updateDetail({rating});
  }
  function openPlaylistPicker(item:Media) {
    setPlaylistPickerItem(item);
    setPlaylistPickerSelection(playlists.filter(playlist=>playlist.itemIds.includes(item.id)).map(playlist=>playlist.id));
  }
  function togglePlaylistPickerSelection(playlistId:string) {
    setPlaylistPickerSelection(current=>current.includes(playlistId)?current.filter(id=>id!==playlistId):[...current,playlistId]);
  }
  function showToast(message:string) {
    setToastMessage(message);window.setTimeout(()=>setToastMessage(''),3500);
  }
  function deletePlaylist(playlistId:string) {
    const playlist=playlists.find(entry=>entry.id===playlistId);
    if(!playlist)return;
    setPlaylists(current=>current.filter(entry=>entry.id!==playlistId));
    setPlaylistPickerSelection(current=>current.filter(id=>id!==playlistId));
    if(selectedPlaylistId===playlistId)setSelectedPlaylistId(null);
    setPlaylistToDelete(null);
    showToast(`Deleted “${playlist.title}”`);
  }
  function confirmPlaylistSelection() {
    if(!playlistPickerItem)return;
    const newlyAdded=playlists.filter(playlist=>playlistPickerSelection.includes(playlist.id)&&!playlist.itemIds.includes(playlistPickerItem.id));
    if(newlyAdded.length){
      setPlaylists(current=>current.map(playlist=>playlistPickerSelection.includes(playlist.id)&&!playlist.itemIds.includes(playlistPickerItem.id)?{...playlist,itemIds:[playlistPickerItem.id,...playlist.itemIds]}:playlist));
      showToast(`Added to ${newlyAdded.map(playlist=>`“${playlist.title}”`).join(' and ')}`);
    }else if(playlistPickerSelection.length){showToast('This title is already in the selected playlist'+(playlistPickerSelection.length>1?'s.':'.'));}
    else {showToast('Choose a playlist first.');return;}
    setPlaylistPickerItem(null);
  }
  function createPlaylist(event: React.FormEvent) {
    event.preventDefault();
    const title = playlistTitle.trim();
    if (!title) return;
    const addedItem=playlistPickerItem;
    const playlist: Playlist = { id:`playlist-${Date.now()}`, title, description:playlistDescription.trim(), category:playlistDraftCategory, coverImage:playlistCover, createdAt:Date.now(), itemIds:addedItem?[addedItem.id]:[] };
    setPlaylists(current => [playlist, ...current]);
    setPlaylistTitle(''); setPlaylistDescription(''); setPlaylistCover(''); setPlaylistModal(false);
    if(addedItem){setPlaylistPickerItem(null);showToast(`Added to “${title}”`);}
  }
  function openPlaylistModal(defaultCategory:PlaylistCategory) {
    setPlaylistDraftCategory(defaultCategory); setPlaylistTitle(''); setPlaylistDescription(''); setPlaylistCover(''); setPlaylistModal(true);
  }
  function addToPlaylist(playlistId:string, mediaId:string) {
    setPlaylists(current => current.map(playlist => playlist.id !== playlistId || playlist.itemIds.includes(mediaId) ? playlist : {...playlist, itemIds:[mediaId,...playlist.itemIds]}));
  }
  function removeFromPlaylist(mediaId:string) {
    if (!selectedPlaylist) return;
    setPlaylists(current => current.map(playlist => playlist.id === selectedPlaylist.id ? {...playlist, itemIds:playlist.itemIds.filter(id => id !== mediaId)} : playlist));
  }
  function movePlaylistItem(mediaId:string, targetId:string) {
    if (!selectedPlaylist || mediaId === targetId) return;
    setPlaylists(current => current.map(playlist => {
      if (playlist.id !== selectedPlaylist.id) return playlist;
      const order = [...playlist.itemIds];
      const from = order.indexOf(mediaId); const to = order.indexOf(targetId);
      if (from < 0 || to < 0) return playlist;
      order.splice(from, 1); order.splice(to, 0, mediaId);
      return {...playlist, itemIds:order};
    }));
  }
  function movePlaylistItemBy(mediaId:string, offset:number) {
    if (!selectedPlaylist) return;
    const index = selectedPlaylist.itemIds.indexOf(mediaId); const target = index + offset;
    if (target < 0 || target >= selectedPlaylist.itemIds.length) return;
    movePlaylistItem(mediaId, selectedPlaylist.itemIds[target]);
  }
  function uploadPlaylistCover(event:React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) { window.alert('Choose an image under 2 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => setPlaylistCover(String(reader.result || '')); reader.readAsDataURL(file);
  }

  function uploadThemeBackground(event:React.ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]; if(!file)return;
    if(!file.type.startsWith('image/')||file.size>4*1024*1024){window.alert('Choose an image file under 4 MB.');event.target.value='';return;}
    const reader=new FileReader();reader.onload=()=>setTheme(current=>({...current,background:String(reader.result||'')}));reader.readAsDataURL(file);event.target.value='';
  }
  function setSelectedPlaylistCover(image:string) {
    if (!selectedPlaylist) return;
    setPlaylists(current => current.map(playlist => playlist.id === selectedPlaylist.id ? {...playlist, coverImage:image} : playlist));
  }
  function uploadSelectedPlaylistCover(event:React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) { window.alert('Choose an image under 2 MB.'); return; }
    const reader = new FileReader(); reader.onload = () => setSelectedPlaylistCover(String(reader.result || '')); reader.readAsDataURL(file);
  }
  function playlistCoverStyle(playlist:Playlist): React.CSSProperties {
    if (playlist.coverImage) return {backgroundImage:`linear-gradient(0deg,rgba(15,16,20,.12),rgba(15,16,20,.12)),url("${playlist.coverImage}")`,backgroundSize:'cover',backgroundPosition:'center'};
    const covers = playlist.itemIds.map(id => items.find(item => item.id === id)?.image).filter(Boolean).slice(0,4) as string[];
    if (!covers.length) return {};
    return {backgroundImage:`${covers.length > 1 ? 'linear-gradient(0deg,rgba(15,16,20,.08),rgba(15,16,20,.08)),' : ''}${covers.map((url,index) => `url("${url}")`).join(',')}`,backgroundSize:covers.length === 1 ? 'cover' : '50% 50%,50% 50%,50% 50%,50% 50%',backgroundPosition:covers.length === 1 ? 'center' : 'left top,right top,left bottom,right bottom'};
  }

  async function submitAuth(event:React.FormEvent) {
    event.preventDefault(); setAuthError('');
    if (!supabase) { setAuthError('Authentication is not configured. Add the Supabase URL and public key to the deployment environment.'); return; }
    const username=authUsername.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) { setAuthError('Username must be 3–24 characters and use only letters, numbers, or underscores.'); return; }
    if (authMode==='signup' && authPassword!==authConfirm) { setAuthError('Passwords do not match.'); return; }
    if (authPassword.length<8) { setAuthError('Password must be at least 8 characters.'); return; }
    setAuthBusy(true);
    try {
      if (authMode==='signup') {
        const {data,error}=await supabase.auth.signUp({email:usernameEmail(username),password:authPassword,options:{data:{username}}});
        if(error)throw new Error(/already registered|already exists|duplicate key|username_normalized/i.test(error.message)?'That username is already taken.':error.message);
        if(!data.session||!data.user)throw new Error('Account created, but sign-in needs email confirmation disabled for username-only accounts. In Supabase, turn off Confirm email, then try logging in.');
        const {error:saveError}=await supabase.from('user_state').upsert({user_id:data.user.id,media_items:items,playlists,appearance:theme},{onConflict:'user_id'});
        if(saveError)throw new Error('Account created, but initial library data could not be saved. Check that the Supabase SQL setup is complete.');
        setAuthUser(data.user);setCloudReady(false);setAuthMode(null);setAuthPassword('');setAuthConfirm('');setAuthUsername('');
        return;
      }
      const {error}=await supabase.auth.signInWithPassword({email:usernameEmail(username),password:authPassword});
      if(error)throw new Error(authMode==='login'?'Incorrect username or password.':`Account created, but sign-in failed: ${error.message}`);
      setAuthMode(null);setAuthPassword('');setAuthConfirm('');setAuthUsername('');
    } catch(error) { setAuthError(error instanceof Error?error.message:'Authentication failed.'); }
    finally { setAuthBusy(false); }
  }
  async function logout() {
    setAccountMenuOpen(false); setAuthUser(null); setCloudReady(false);
    try { const savedItems=JSON.parse(localStorage.getItem('sidequest-media')||'[]');setItems(normalizeLibraryItems(savedItems)); } catch { setItems([]); }
    try { const savedLists=JSON.parse(localStorage.getItem('sidequest-playlists')||'[]');setPlaylists(Array.isArray(savedLists)?savedLists:[]); } catch { setPlaylists([]); }
    try { setTheme({...defaultTheme,...JSON.parse(localStorage.getItem('sidequest-theme')||'{}')}); } catch { setTheme(defaultTheme); }
    await supabase?.auth.signOut();
  }

  searchActions.current={open:openSearchDetails,add,track:trackAndOpen};
  mediaActions.current={open:id=>{const item=items.find(entry=>entry.id===id);if(item)void openDetails(item)},add:id=>{const item=items.find(entry=>entry.id===id);if(item)openPlaylistPicker(item)},remove:removeFromLibrary};
  const modalIsOpen=Boolean(detailItem||themePanelOpen||playlistModal||playlistPickerItem||coverEditorOpen||playlistToDelete||authMode);
  return <main className={`app-shell${modalIsOpen?' modal-open':''}`}>
    <aside className="sidebar">
      <a className="brand" href="#"><span className="brand-icon">✳</span><span>gatari<span className="brand-dot">.</span><small>YOUR PERSONAL MEDIA LOG</small></span></a>
      <div className="side-label">YOUR LIBRARY</div>
      <nav><button onClick={()=>setActive('Home')} aria-label="Home" data-tooltip="Home" className={`nav-item ${active==='Home'?'active':''}`}><span className="nav-icon"><HomeIcon size={18}/></span><span className="nav-label">Home</span></button>{categories.map((c,i)=>{const icons=[Tv,BookOpen,Layers,Gamepad2,FileText,Film];const CategoryIcon=icons[i];return <button key={c} onClick={()=>{setActive(c);setCategorySection('Items');clearCategorySearch();setGenre('All genres')}} aria-label={c} data-tooltip={c} className={`nav-item ${active===c?'active':''}`}><span className="nav-icon"><CategoryIcon size={18}/></span><span className="nav-label">{c}</span><span className="nav-count">{items.filter(x=>x.type===c).length||''}</span></button>})}<button onClick={()=>{setActive('Playlists');setSelectedPlaylistId(null)}} aria-label="Playlists" data-tooltip="Playlists" className={`nav-item ${active==='Playlists'?'active':''}`}><span className="nav-icon"><ListMusic size={18}/></span><span className="nav-label">Playlists</span><span className="nav-count">{playlists.length||''}</span></button><button onClick={()=>setActive('Stats')} aria-label="Stats" data-tooltip="Stats" className={`nav-item ${active==='Stats'?'active':''}`}><span className="nav-icon"><ChartNoAxesColumnIncreasing size={18}/></span><span className="nav-label">Stats</span></button></nav>
      <div className="sidebar-bottom"><div className="sync-card"><div className="sync-icon">◉</div><div><b>Your private list</b><span>Only you can see your tracking.</span></div><span className="online-dot"/></div><div className="profile-row"><div className="avatar you">Y</div><div><b>You</b><span>Personal account</span></div><button className="more-btn">···</button></div></div>
    </aside>
    <section className="main-panel">
      <header className="topbar"><div className="breadcrumbs">My library <span>/</span> <b>{active === 'Stats' ? 'Stats' : active === 'Playlists' && selectedPlaylist ? selectedPlaylist.title : active}</b></div><div className="top-actions">{authUser?<div className="account-wrap"><button className="account-trigger" onClick={()=>setAccountMenuOpen(value=>!value)} aria-expanded={accountMenuOpen}><span className="avatar you">{(authUser.user_metadata?.username||'U').slice(0,1).toUpperCase()}</span><span>{authUser.user_metadata?.username||'Account'}</span><small>⌄</small></button>{accountMenuOpen&&<div className="account-menu"><b>@{authUser.user_metadata?.username||'user'}</b><span>Synced across your devices</span><button onClick={()=>void logout()}>Log out</button></div>}</div>:<button className="auth-open-btn" onClick={()=>{setAuthMode('login');setAuthError('')}}>Log In <span>/</span> Sign Up</button>}<button className="theme-open-btn" title="Customize Theme" aria-label="Customize Theme" onClick={()=>setThemePanelOpen(true)}><Palette size={17}/></button>{!authUser&&<button className="avatar you" title="Guest profile">G</button>}</div></header>
      <div className="content">
        {active==='Home' ? <>
          <section className="home-welcome"><div className="home-welcome-copy"><div className="eyebrow">YOUR PERSONAL MEDIA UNIVERSE <span>✦</span></div><h1>Welcome back, <em>You & Mira.</em></h1><p>Pick up where you left off, or find something new to love.</p></div><div className="welcome-orbit"><span>✳</span></div></section>
          <section className="home-search"><div className="home-search-heading"><div><span className="eyebrow">DISCOVER SOMETHING NEW</span><h2>Search every catalog</h2><p>One search across all your favorite formats.</p></div><span className="command-key">⌘ K</span></div><form className="home-search-form" onSubmit={event=>event.preventDefault()}><span className="search-icon">⌕</span><input value={homeQuery} onChange={event=>setHomeQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();clearHomeSearch();event.currentTarget.blur()}}} placeholder="Search anime, manga, novels, shows…"/>{homeQuery&&<button type="button" className="search-clear" aria-label="Clear search" onClick={clearHomeSearch}>×</button>}<button type="submit" disabled={homeSearching}>{homeSearching?'Searching…':'Search all'}</button></form><div className="home-category-pills">{['All',...categories].map(category=><button key={category} className={homeFilter===category?'active':''} onClick={()=>setHomeFilter(category)}>{category==='Visual Novels'?'VN':category==='Web Novels'?'WN':category==='Shows'?'TV':category}</button>)}</div>{homeSearchError&&<p className="error-note">{homeSearchError}</p>}{homeSearching&&<div className="search-skeletons">{[0,1,2].map(index=><div className="search-skeleton" key={index}><i/><span><b/><small/></span></div>)}</div>}{visibleHomeResults.length>0&&<><div className="result-head"><b>Global results · {visibleHomeResults.length}</b><button type="button" className="clear-results-btn" onClick={clearHomeSearch}>× Clear results</button></div><HomeSearchResultGrid results={visibleHomeResults} onAdd={dispatchAddResult}/></>}</section>
          <section className="home-kpis"><article><span>✳</span><small>TITLES TRACKED</small><b>{items.length}</b><i>Across all categories</i></article><article><span>◷</span><small>WATCHED / READ</small><b>{watchHours}<em>h</em> <em>·</em> {chaptersRead}<em> ch</em></b><i>Estimated viewing time · logged chapters</i></article><article><span>★</span><small>TOP RATED</small><b className="kpi-title">{topRated?.title||'Not rated yet'}</b><i>{topRated?`${topRated.rating}/10 · ${topRated.type}`:'Rate a title to see your favorite'}</i></article><article><span>▧</span><small>PLAYLISTS</small><b>{playlists.length}</b><i>Curated collections</i></article></section>
          <section className="home-section"><div className="home-section-heading"><div><div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div><h2>Continue watching <span>& reading</span></h2></div><button onClick={()=>setActive('Anime')}>Your library ↗</button></div>{continueItems.length?<div className="continue-shelf">{continueItems.map(item=><article className="continue-card" key={item.id}><button className="continue-poster" onClick={()=>void openDetails(item)}><MediaImage src={item.customCover||item.image||imageFallback} sizes="(max-width: 600px) 150px, 240px" alt=""/><span className="continue-progress">{item.progress}{item.total?` / ${item.total}`:''} {item.type==='Anime'||item.type==='Shows'?'eps':'ch'}</span><i style={{width:`${item.total?Math.min(100,item.progress/item.total*100):0}%`}}/></button><div className="continue-copy"><b>{item.title}</b><span>{item.type} · {item.status}</span><button aria-label={`Add one ${item.type==='Anime'||item.type==='Shows'?'episode':'chapter'} to ${item.title}`} onClick={()=>updateItem(item.id,{progress:item.progress+1,status:item.total&&item.progress+1>=item.total?'Completed':item.status})}>＋1 {item.type==='Anime'||item.type==='Shows'?'episode':'chapter'}</button></div></article>)}</div>:<div className="home-inline-empty">Nothing in progress yet. Start something from any category below.</div>}</section>
          <section className="home-section category-jumps"><div className="home-section-heading"><div><div className="eyebrow">EXPLORE YOUR LIBRARY</div><h2>Jump into a category</h2></div></div><div className="category-jump-grid">{categories.map((category,index)=>{const latest=items.find(item=>item.type===category);const names:Record<Category,string>={'Anime':'Anime','Manga':'Manga','Manhwa':'Manhwa','Visual Novels':'Visual novels','Web Novels':'Web novels','Shows':'TV shows'};return <button key={category} className="category-jump-card" style={{'--jump-image':latest?.image?`url("${latest.image}")`:'none','--jump-index':index} as React.CSSProperties} onClick={()=>{setActive(category);setCategorySection('Items');clearCategorySearch()}}><span className="jump-index">0{index+1}</span><div><b>{names[category]}</b><span>{items.filter(item=>item.type===category).length} titles <i>↗</i></span></div></button>})}</div></section>
          <section className="home-section recently-shelf-section"><div className="home-section-heading"><div><div className="eyebrow">FRESH FROM THE LIBRARY</div><h2>Recently added <span>to your list</span></h2></div><button onClick={()=>setActive('Anime')}>Your library ↗</button></div>{recentItems.length?<div className="recent-shelf">{recentItems.map(item=><button className="recent-item" key={item.id} onClick={()=>void openDetails(item)}><MediaImage src={item.customCover||item.image||imageFallback} sizes="(max-width: 600px) 132px, 180px" alt=""/><span className="recent-copy"><b>{item.title}</b><small>{item.type} · Added by {item.addedBy} · {addedAge(item.updatedAt||item.addedAt).replace('Added ','')}</small></span><i>↗</i></button>)}</div>:<div className="home-inline-empty">New additions will show up here.</div>}</section>
          <section className="random-pick"><div className="random-orbit">✧</div><div><div className="eyebrow">CAN’T DECIDE?</div><h2>What should we start next?</h2><p>{randomPick?`Tonight’s pick: ${randomPick.title} · ${randomPick.type}`:'Pick something from your Plan to Watch list.'}</p></div><button onClick={()=>{const candidates=items.filter(item=>item.status==='Plan to Watch');setRandomPick(candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:null)}}>✦ &nbsp; {randomPick?'Pick again':'Surprise me'}</button>{randomPick&&<button className="random-view" onClick={()=>void openDetails(randomPick)}>View title ↗</button>}</section>
        </> : active==='Stats' ? <>
          <div className="page-heading"><div><div className="eyebrow">YOUR PERSONAL STATS</div><h1>Your story, <em>in numbers.</em></h1><p>A little look at everything you’ve watched and read.</p></div><div className="date-chip">✦ &nbsp; ALL TIME</div></div>
          <div className="stat-cards"><div className="stat-card accent-card"><span className="stat-label">TITLES TRACKED</span><strong>{stats.total}</strong><span className="stat-foot">across your shared library</span><div className="sparkline">⌁</div></div><div className="stat-card"><span className="stat-label">EPISODES & CHAPTERS</span><strong>{items.reduce((n,x)=>n+x.progress,0).toLocaleString()}</strong><span className="stat-foot">logged so far</span></div><div className="stat-card"><span className="stat-label">AVERAGE RATING</span><strong>{(items.filter(x=>x.rating>0).reduce((n,x)=>n+x.rating,0)/(items.filter(x=>x.rating>0).length||1)).toFixed(1)}<small>/ 10</small></strong><span className="stat-foot">from {items.filter(x=>x.rating>0).length} scored titles</span></div></div>
          <div className="charts-grid"><div className="panel-card"><div className="panel-title"><div><h2>The collection</h2><p>Titles by format</p></div><span className="chart-glyph">◉</span></div><div className="collection-chart"><div className="donut" style={{background:donutBackground}}><div><b>{stats.total}</b><span>TITLES</span></div></div><div className="legend">{categories.map((c,i)=><div key={c}><i className={`legend-dot d${i}`}/><span>{c}</span><b>{items.filter(x=>x.type===c).length}</b></div>)}</div></div></div>
          <div className="panel-card"><div className="panel-title"><div><h2>Top genres</h2><p>What you gravitate towards</p></div><span className="chart-glyph">↗</span></div><div className="bars">{(stats.genres.length?stats.genres:[{name:'Add titles to see genres',count:0}]).map((g,i)=><div className="bar-row" key={g.name}><span>{g.name}</span><div className="bar-track"><i style={{width:`${g.count?Math.max(12,g.count/Math.max(stats.genres[0]?.count||1,1)*100):0}%`}}/></div><b>{g.count}</b></div>)}</div></div>
          <div className="panel-card"><div className="panel-title"><div><h2>Score distribution</h2><p>Your personal ratings</p></div><span className="chart-glyph">★</span></div><div className="score-chart">{stats.scores.map(x=><div key={x.score} className="score-col"><b>{x.count||''}</b><i style={{height:`${Math.max(5,x.count*18)}px`}}/><span>{x.score}</span></div>)}</div></div>
          <div className="panel-card"><div className="panel-title"><div><h2>Your status breakdown</h2><p>Where your list stands</p></div><span className="chart-glyph">⌁</span></div><div className="people-compare">{stats.statuses.length?stats.statuses.map((entry)=><div className="person-stat" key={entry.status}><div className="status-mark">{entry.status==='Completed'?'✓':entry.status==='On Hold'?'Ⅱ':entry.status==='Dropped'?'×':'→'}</div><div className="person-info"><b>{entry.status}</b><span>titles in this status</span></div><div className="mean-score"><b>{entry.count}</b><span>titles</span></div></div>):<div className="empty-stats">Add titles to see your status breakdown.</div>}</div></div></div>
        </> : active === 'Playlists' ? <>
          {selectedPlaylist ? <>
            <button className="back-link" onClick={()=>{setSelectedPlaylistId(null);setPlaylistSearch('');setPlaylistCategory('All categories');setPlaylistGenre('All genres')}}>← All playlists</button>
            <section className="playlist-hero"><div className="playlist-cover-wrap"><div className="playlist-cover large" style={playlistCoverStyle(selectedPlaylist)}>{!selectedPlaylist.coverImage&&selectedPlaylist.itemIds.length===0&&<span>✳</span>}</div><div className="playlist-cover-tools"><label>Upload cover<input type="file" accept="image/*" onChange={uploadSelectedPlaylistCover}/></label><Dropdown label="Choose playlist cover" value={selectedPlaylist.coverImage} onChange={setSelectedPlaylistCover} options={[{value:'',label:'Auto cover'},...playlistMedia.filter(item=>item.image).map(item=>({value:item.image,label:item.title}))]}/></div></div><div className="playlist-hero-copy"><div className="eyebrow">{selectedPlaylist.category.toUpperCase()} PLAYLIST · {selectedPlaylist.itemIds.length} TITLES</div><h1>{selectedPlaylist.title}<em>.</em></h1><p>{selectedPlaylist.description||'A collection of stories you want to keep close.'}</p><span className="playlist-owner"><span className="avatar you">Y</span> Created by You · {selectedPlaylist.itemIds.length} items</span></div></section>
            <div className="playlist-toolbar"><input aria-label="Search playlist" placeholder="Search in this playlist..." value={playlistSearch} onChange={e=>setPlaylistSearch(e.target.value)}/><Dropdown label="Playlist sort" value={playlistSort} onChange={setPlaylistSort} options={['Recently added','Oldest added','Title: A to Z','Rating: high to low'].map(value=>({value,label:value}))}/><Dropdown label="Filter playlist category" value={playlistCategory} onChange={setPlaylistCategory} options={['All categories',...categories].map(value=>({value,label:value}))}/><Dropdown label="Filter playlist genre" value={playlistGenre} onChange={setPlaylistGenre} options={['All genres',...[...new Set(playlistMedia.flatMap(item=>item.genres))].sort()].map(value=>({value,label:value}))}/></div>
            <div className="playlist-table-head"><span>#</span><span>Title</span><span>Category</span><span>Year</span><span>Status</span><span>Rating</span><span>Actions</span></div>
            <div className="playlist-rows">{visiblePlaylistMedia.length ? visiblePlaylistMedia.map((item,index)=><article className="playlist-row" key={item.id} draggable onDragStart={event=>event.dataTransfer.setData('text/plain',item.id)} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();movePlaylistItem(event.dataTransfer.getData('text/plain'),item.id)}}><span className="playlist-index">{String(index+1).padStart(2,'0')}<span className="drag-handle">⠿</span></span><div className="playlist-track"><MediaImage src={item.image||imageFallback} sizes="64px" alt=""/><div><b>{item.title}</b><span>{item.genres.slice(0,3).join(' · ')||'No tags'}</span></div></div><span className="playlist-category">{item.type}</span><span className="playlist-year">{item.year||'—'}</span><Dropdown className="playlist-status" status label={`Status for ${item.title}`} value={item.status} onChange={value=>updateItem(item.id,{status:value as Status})} options={statuses.map(status=>({value:status,label:status}))}/><Dropdown className="playlist-rating" label={`Rating for ${item.title}`} value={String(item.rating)} onChange={value=>updateItem(item.id,{rating:Number(value)})} options={[{value:'0',label:'Unrated'},...Array.from({length:10},(_,i)=>({value:String(i+1),label:`${i+1} / 10`}))]}/><div className="playlist-actions"><button title="Move up" onClick={()=>movePlaylistItemBy(item.id,-1)}>↑</button><button title="Move down" onClick={()=>movePlaylistItemBy(item.id,1)}>↓</button><button className="remove-playlist-item" onClick={()=>removeFromPlaylist(item.id)}>Remove</button></div></article>):<div className="empty-state"><div>▧</div><h3>{playlistMedia.length?'No matches found':'This playlist is ready for a story'}</h3><p>{playlistMedia.length?'Try a different title, category, or genre filter.':'Add tracked titles to this playlist from any category page.'}</p><button className="create-playlist-btn" onClick={()=>{setActive('Anime');setSelectedPlaylistId(null)}}>Browse your library</button></div>}</div>
          </> : <>
            <div className="page-heading library-heading"><div><div className="eyebrow">CURATE YOUR COLLECTION <span>✦</span></div><h1>All playlists<em>.</em></h1><p>Every collection in one place, from a single category to mixed media.</p></div><button className="create-playlist-btn" onClick={()=>openPlaylistModal('Mixed')}>＋ New playlist</button></div>
            <div className="playlist-hub-filters">{['All',...categories,'Mixed'].map(filter=><button key={filter} className={hubPlaylistFilter===filter?'active':''} onClick={()=>setHubPlaylistFilter(filter)}>{filter==='Visual Novels'?'VN':filter==='Web Novels'?'WN':filter==='Mixed'?'Mixed':filter}</button>)}</div>
            {hubPlaylists.length ? <div className="playlist-grid">{hubPlaylists.map(playlist=><div className="playlist-card-shell" key={playlist.id}><button className="playlist-card" onClick={()=>setSelectedPlaylistId(playlist.id)}><div className="playlist-cover" style={playlistCoverStyle(playlist)}>{!playlist.coverImage&&playlist.itemIds.length===0&&<span>✳</span>}<i>{playlist.itemIds.length} TITLES</i></div><div className="playlist-card-copy"><b>{playlist.title}</b><span>{playlist.category} playlist · {playlist.description||'Created by You'}</span></div></button><button type="button" className="playlist-delete-btn" aria-label={`Delete playlist ${playlist.title}`} title={`Delete playlist ${playlist.title}`} onClick={()=>setPlaylistToDelete(playlist)}><Trash2 size={15}/></button></div>)}</div> : <div className="empty-state playlist-empty"><div>▧</div><h3>{playlists.length?'No playlists in this category':'Your playlists start here'}</h3><p>{playlists.length?'Try another category filter, or create a playlist here.':'Make a reading order, a weekend watchlist, or one big mixed-media collection.'}</p><button className="create-playlist-btn" onClick={()=>openPlaylistModal(hubPlaylistFilter==='All'?'Mixed':hubPlaylistFilter as PlaylistCategory)}>＋ Create playlist</button></div>}
          </>}
        </> : <>
          <div className="page-heading library-heading"><div><div className="eyebrow">YOUR PERSONAL LIBRARY <span>✦</span></div><h1>{active === 'Shows' ? 'Shows' : active === 'Visual Novels' ? 'Visual novels' : active === 'Web Novels' ? 'Web novels' : active}<em>.</em></h1><p>Keep track of what you’re watching and reading.</p></div><div className="heading-count"><b>{items.filter(x=>x.type===active).length.toString().padStart(2,'0')}</b><span>IN YOUR LIST</span></div></div>
          {categoryFeature&&<section className="category-hero" style={{backgroundImage:`linear-gradient(90deg,#08090df2 0%,#08090dcc 44%,#08090d35 100%),url("${categoryFeature.customCover||categoryFeature.image}")`}}><div className="category-hero-copy"><span className="hero-kicker">✦ YOUR {active.toUpperCase()} SPOTLIGHT</span><h2>{categoryFeature.title}</h2><p>{categoryFeature.genres.slice(0,3).join(' · ')}{categoryFeature.year?` · ${categoryFeature.year}`:''}</p><button onClick={()=>void openDetails(categoryFeature)}>Explore title <span>↗</span></button></div><div className="hero-kpis"><div><b>{items.filter(x=>x.type===active).length}</b><span>IN YOUR LIST</span></div><div><b>{items.filter(x=>x.type===active&&x.status==='Completed').length}</b><span>COMPLETED</span></div><div><b>{items.filter(x=>x.type===active).reduce((sum,item)=>sum+item.progress,0).toLocaleString()}</b><span>EPS / CHAPTERS</span></div></div></section>}
          <div className="category-subtabs"><button className={categorySection==='Items'?'active':''} onClick={()=>setCategorySection('Items')}>All {active} items</button><button className={categorySection==='Playlists'?'active':''} onClick={()=>setCategorySection('Playlists')}>{active} playlists <span>{categoryPlaylists.length}</span></button></div>
          {categorySection === 'Items' ? <>
          <section className="search-block"><div className="search-heading"><div><span className="eyebrow">FIND SOMETHING GOOD</span><h2>Add to your collection</h2></div><span className="source-tag">{active==='Shows'?'TMDB':active==='Visual Novels'?'VNDB':active==='Web Novels'?'Kitsu · novel catalog':active==='Manga'||active==='Manhwa'?'Comick':'AniList'} <span>↗</span></span></div><form className="search-form" onSubmit={e=>e.preventDefault()}><span className="search-icon">⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();clearCategorySearch();event.currentTarget.blur()}}} placeholder={`Search ${active.toLowerCase()}...`} />{query&&<button type="button" className="search-clear" aria-label="Clear search" title="Clear search" onClick={clearCategorySearch}>×</button>}<kbd>↵</kbd><button className="search-btn" disabled={searching}>{searching?'Searching…':'Search titles'}</button></form>{searching&&<div className="search-skeletons" aria-label="Loading search results">{[0,1,2].map(index=><div className="search-skeleton" key={index}><i/><span><b/><small/></span></div>)}</div>}
            {searchError&&<div className="error-note">{searchError}</div>}{hasSearched&&!searching&&!searchError&&results.length===0&&<div className="error-note">No {active.toLowerCase()} matched that search. Try another title.</div>}{results.length>0&&<div className="results-wrap"><div className="result-head"><b>Search results <span>{results.length} found</span></b><button type="button" className="clear-results-btn" onClick={clearCategorySearch}>× Clear results</button></div><SearchResultGrid results={results} addedKeys={addedResultKeys} onOpen={dispatchOpenResult} onAdd={dispatchTrackResult}/></div>}</section>
          <div className="list-toolbar"><div><h2>The list <span>{visibleItems.length}</span></h2><p>Your personal watch and reading queue.</p></div><div className="filters"><Dropdown label="Filter genre" value={genre} onChange={setGenre} options={['All genres',...allGenres].map(value=>({value,label:value}))}/><Dropdown label="Filter status" status value={statusFilter} onChange={setStatusFilter} options={['All statuses',...statuses].map(value=>({value,label:value}))}/><Dropdown label="Sort titles" value={sort} onChange={setSort} options={['Recently added','Rating: high to low','Title: A to Z'].map(value=>({value,label:value}))}/></div></div>
          {visibleItems.length===0?<div className="empty-state"><div className="empty-art">✳</div><span className="eyebrow">YOUR NEXT FAVORITE IS OUT THERE</span><h3>Nothing here just yet</h3><p>Search the catalog to add your first {active.toLowerCase()} to your collection.</p><button className="create-playlist-btn" onClick={()=>document.querySelector<HTMLInputElement>('.search-form input')?.focus()}>⌕ &nbsp; Search {active}</button></div>:<div className="media-grid">{visibleItems.map(item=><MediaCard key={item.id} item={item} onOpen={dispatchOpenMedia} onAdd={dispatchAddMedia} onRemove={dispatchRemoveMedia}/>) }</div>}
          </> : <>
            <div className="page-heading library-heading playlist-category-heading"><div><div className="eyebrow">{active.toUpperCase()} COLLECTIONS <span>✦</span></div><h1>{active} playlists<em>.</em></h1><p>Playlists created for {active} appear here and in your central playlist hub.</p></div></div>
            {categoryPlaylists.length ? <div className="playlist-grid">{categoryPlaylists.map(playlist=><div className="playlist-card-shell" key={playlist.id}><button className="playlist-card" onClick={()=>{setActive('Playlists');setSelectedPlaylistId(playlist.id)}}><div className="playlist-cover" style={playlistCoverStyle(playlist)}>{!playlist.coverImage&&playlist.itemIds.length===0&&<span>✳</span>}<i>{playlist.itemIds.length} TITLES</i></div><div className="playlist-card-copy"><b>{playlist.title}</b><span>{playlist.category} playlist · {playlist.description||'Created by You'}</span></div></button><button type="button" className="playlist-delete-btn" aria-label={`Delete playlist ${playlist.title}`} title={`Delete playlist ${playlist.title}`} onClick={()=>setPlaylistToDelete(playlist)}><Trash2 size={15}/></button></div>)}</div> : <div className="empty-state playlist-empty"><div>▧</div><h3>No {active} playlists yet</h3><p>Create one here and it will also appear in All Playlists.</p><button className="create-playlist-btn" onClick={()=>openPlaylistModal(active as Category)}>＋ Create {active} playlist</button></div>}
          </>}
        </>}
        {playlistPickerItem&&<div className="modal-scrim playlist-picker-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setPlaylistPickerItem(null)}}>
          <section className="playlist-picker" role="dialog" aria-modal="true" aria-label={`Select playlists for ${playlistPickerItem.title}`}>
            <button className="modal-close" aria-label="Close playlist selector" onClick={()=>setPlaylistPickerItem(null)}>×</button>
            <div className="picker-title-row"><div className="picker-poster">{(playlistPickerItem.customCover||playlistPickerItem.image)&&!failedCovers[playlistPickerItem.id]?<MediaImage src={playlistPickerItem.customCover||playlistPickerItem.image||imageFallback} sizes="100px" onError={()=>setFailedCovers(current=>({...current,[playlistPickerItem.id]:true}))} alt=""/>:<CoverFallback title={playlistPickerItem.title} type={playlistPickerItem.type}/>}</div><div><div className="eyebrow">SELECT PLAYLIST</div><h2>Add “{playlistPickerItem.title}” to…</h2><p>Choose one or more collections.</p></div></div>
            <div className="picker-suggestions"><span>Recommended for {playlistPickerItem.type}</span><i>Matching category and Mixed playlists appear first</i></div>
            <div className="picker-playlist-list">{[...playlists].sort((a,b)=>{const am=a.category===playlistPickerItem.type||a.category==='Mixed'?0:1;const bm=b.category===playlistPickerItem.type||b.category==='Mixed'?0:1;return am-bm||a.title.localeCompare(b.title)}).map(playlist=>{const alreadyAdded=playlist.itemIds.includes(playlistPickerItem.id);const checked=alreadyAdded||playlistPickerSelection.includes(playlist.id);return <label className={`picker-playlist-row ${alreadyAdded?'already-added':''}`} key={playlist.id}><input type="checkbox" checked={checked} disabled={alreadyAdded} onChange={()=>togglePlaylistPickerSelection(playlist.id)}/><span className="picker-checkmark">{checked?'✓':''}</span><span className="picker-playlist-copy"><b>{playlist.title}</b><span>{playlist.category} · {playlist.itemIds.length} {playlist.itemIds.length===1?'title':'titles'}{playlist.category===playlistPickerItem.type||playlist.category==='Mixed'?' · Suggested':''}</span></span><span className={`picker-added-badge ${alreadyAdded?'visible':''}`}>{alreadyAdded?'Added':''}</span></label>})}{playlists.length===0&&<div className="picker-empty">No playlists yet. Create one below and this title will be added to it.</div>}</div>
            <button className="picker-create-new" onClick={()=>openPlaylistModal(playlistPickerItem.type)}>＋ Create New Playlist</button>
            <div className="picker-actions"><button className="cancel-btn" onClick={()=>setPlaylistPickerItem(null)}>Cancel</button><button className="create-playlist-btn" onClick={confirmPlaylistSelection}>{playlistPickerSelection.length?'Add to selected':'Select a playlist'}</button></div>
          </section>
        </div>}
        {detailItem&&<div className="modal-scrim details-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)closeDetails()}}>
          <section className="details-panel details-split-panel" role="dialog" aria-modal="true" aria-label={`${detailItem.title} details`}>
            <button className="modal-close" aria-label="Close details" onClick={closeDetails}>×</button>
            <div className="details-layout">
              <aside className="details-left-column">
                <div className="details-poster">{(detailItem.customCover||detailItem.image)&&!failedCovers[detailItem.id]?<MediaImage src={detailItem.customCover||detailItem.image||imageFallback} sizes="(max-width: 760px) 40vw, 320px" onError={()=>setFailedCovers(current=>({...current,[detailItem.id]:true}))} alt={`${detailItem.title} cover`}/>:<CoverFallback title={detailItem.title} type={detailItem.type}/>}<button className="cover-cloud-button" aria-label="Change cover" title="Change cover" onClick={()=>{setCoverUrlDraft(detailItem.customCover||'');setCoverEditorOpen(true)}}>☁</button></div>
                <div className="details-poster-quick-meta"><span>{detailItem.type}</span><span>{detailItem.year||'Year unknown'}</span><span>{detailItem.total?`${detailItem.total} ${detailItem.type==='Anime'||detailItem.type==='Shows'?'episodes':'chapters'}`:'Length unknown'}</span></div>
              </aside>
              <div className="details-right-column">
                <div className="details-navigation"><button onClick={closeDetails}>← Home</button><span>{detailItem.type}</span></div>
                <div className="eyebrow">{detailItem.type.toUpperCase()} · {detailItem.year||'YEAR UNKNOWN'}</div>
                <h2 className="details-title">{detailItem.title}</h2>
                {(detailExtra[detailItem.id]?.nativeTitle||detailItem.nativeTitle)&&<p className="details-native">{detailExtra[detailItem.id]?.nativeTitle||detailItem.nativeTitle}</p>}
                <div className="details-genres">{(detailExtra[detailItem.id]?.genres||detailItem.genres).map((tag:string)=><button key={tag} onClick={()=>{setGenre(tag);setCategorySection('Items');closeDetails()}}>{tag}</button>)}</div>
                <div className="details-quick-stats"><span>◉ {detailExtra[detailItem.id]?.popularity||detailItem.popularity?Number(detailExtra[detailItem.id]?.popularity||detailItem.popularity).toLocaleString()+' popularity':'Popularity unavailable'}</span><i>•</i><span>▤ {detailExtra[detailItem.id]?.total||detailItem.total||0} {detailItem.type==='Anime'||detailItem.type==='Shows'?'episodes':'chapters'}</span></div>
                <div className="details-info-badges"><span><small>TYPE</small><b>{detailItem.type}</b></span><span><small>STATUS</small><b>{detailExtra[detailItem.id]?.status||'Catalog entry'}</b></span><span><small>AUTHOR / STUDIO</small><b>{detailExtra[detailItem.id]?.author||detailExtra[detailItem.id]?.studio||detailItem.author||detailItem.studio||'Unknown'}</b></span><span><small>RELEASE</small><b>{detailExtra[detailItem.id]?.releaseDate||detailItem.releaseDate||detailItem.year||'Unknown'}</b></span></div>
                <section className="details-section"><h3>Synopsis</h3><div className="details-synopsis">{detailLoading?'Loading source details…':cleanDescription(detailExtra[detailItem.id]?.description||detailItem.description||'')||'No synopsis is available for this title.'}</div></section>
                {detailError&&<p className="error-note">{detailError}</p>}
                <section className="details-section chapters-section"><h3>{detailItem.type==='Anime'||detailItem.type==='Shows'?'Episodes':'Chapters / episodes'}</h3><div className="chapters-empty">{detailExtra[detailItem.id]?.chapters?.length?detailExtra[detailItem.id].chapters.map((chapter:any)=><div key={chapter.id}>{chapter.title||chapter.number}</div>):<span>No chapters found in the connected catalog.</span>}</div></section>
              </div>
            </div>
            <div className="details-actions details-action-bar">
              <div className="details-footer-progress"><span>{detailItem.status==='Watching'||detailItem.status==='Reading'?'IN PROGRESS':'TRACKING'}</span><div className="details-tracking-inputs"><input className="tracking-number-input progress-number-input" aria-label="Episodes or chapters completed" type="number" min="0" step="1" value={progressDraft} onChange={event=>{const next=event.target.value;if(/^\d*$/.test(next))setProgressDraft(next)}} onBlur={commitProgressDraft} onKeyDown={event=>{if(['e','E','+','-','.'].includes(event.key))event.preventDefault();if(event.key==='Enter')event.currentTarget.blur()}}/><span>{detailItem.type==='Anime'||detailItem.type==='Shows'?'ep':'ch'}{detailItem.total?` / ${detailItem.total}`:''}</span><i>·</i><input className="tracking-number-input rating-number-input" aria-label="Personal rating out of 10" type="number" min="0" max="10" step="0.1" value={ratingDraft} placeholder="—" onChange={event=>{const next=event.target.value;if(/^(?:\d{0,2}(?:\.\d?)?)?$/.test(next)&&(next===''||Number(next)<=10))setRatingDraft(next)}} onBlur={commitRatingDraft} onKeyDown={event=>{if(['e','E','+','-'].includes(event.key))event.preventDefault();if(event.key==='Enter')event.currentTarget.blur()}}/><span>/ 10</span></div></div>
              <div className="details-footer-controls"><Dropdown className="details-status-control" label="Tracking status" status value={['Plan to Watch','Watching','Reading','Completed','On Hold','Dropped','Revisiting'].includes(detailItem.status)?detailItem.status:'Plan to Watch'} onChange={value=>updateDetail({status:value as Status})} options={['Plan to Watch','Watching','Reading','Completed','On Hold','Dropped','Revisiting'].map(value=>({value,label:value==='Plan to Watch'?'Plan to watch':value==='On Hold'?'On hold':value}))}/>
              <div className="details-more-wrap" ref={detailMoreRef}><button type="button" className="details-more-trigger" aria-label="More title actions" aria-haspopup="menu" aria-expanded={detailMoreOpen} onClick={()=>{setDetailMoreOpen(current=>!current);setRatingSelectorOpen(false)}}><Menu size={18}/></button>{detailMoreOpen&&<div className="details-more-menu" role="menu" aria-label="Title actions">
                <button type="button" role="menuitem" onClick={()=>setRatingSelectorOpen(current=>!current)}>★ <span>Rate title {detailItem.rating?`· ${detailItem.rating}/10`:''}</span></button>
                {ratingSelectorOpen&&<div className="details-rate-picker" aria-label="Choose a rating">{Array.from({length:10},(_,index)=><button key={index+1} aria-label={`Rate ${index+1} out of 10`} className={detailItem.rating>=index+1?'selected':''} onClick={()=>{updateDetail({rating:index+1});setRatingSelectorOpen(false)}}>★</button>)}</div>}
                <button type="button" role="menuitem" onClick={()=>{const saved=ensureDetailSaved();if(saved){setDetailMoreOpen(false);openPlaylistPicker(saved)}}}>☷ <span>Add to playlist</span></button>
                <button type="button" role="menuitem" onClick={()=>{updateDetail({status:'Completed',progress:detailItem.total??detailItem.progress});setDetailMoreOpen(false)}}>✓ <span>Mark as {detailItem.type==='Anime'||detailItem.type==='Shows'?'watched':'read'}</span></button>
                {detailIsTracked&&<button type="button" role="menuitem" className="remove-action" onClick={()=>removeFromLibrary(detailItem.id)}><Trash2 size={15}/><span>Remove from library</span></button>}
              </div>}</div><button type="button" className="details-done-button" onClick={saveAndCloseDetails}>Done</button></div>
            </div>
            {coverEditorOpen&&<div className="cover-editor-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setCoverEditorOpen(false)}}><section className="cover-editor-dialog" role="dialog" aria-modal="true" aria-label="Change cover"><button className="cover-editor-close" aria-label="Close cover editor" onClick={()=>setCoverEditorOpen(false)}>×</button><div className="eyebrow">PERSONALIZE</div><h3>Custom cover</h3><p>Choose an image URL or upload a cover from your device.</p><div className="cover-url-row"><input aria-label="Custom cover image URL" type="url" placeholder="Paste an image URL…" value={coverUrlDraft} onChange={event=>setCoverUrlDraft(event.target.value)}/><button onClick={()=>{saveMediaCoverUrl();setCoverEditorOpen(false)}}>Save URL</button></div><label className="cover-upload">Upload image from device<input type="file" accept="image/*" onChange={event=>{uploadMediaCover(event);setCoverEditorOpen(false)}}/><small>Image files · up to 2 MB</small></label>{detailItem.customCover&&<button className="cover-reset" onClick={()=>{clearMediaCover();setCoverEditorOpen(false)}}>Restore original cover</button>}</section></div>}
          </section>
        </div>}
        {playlistModal&&<div className={`modal-scrim ${playlistPickerItem?'quick-create-scrim':''}`} onMouseDown={event=>{if(event.target===event.currentTarget)setPlaylistModal(false)}}><form className="playlist-modal" onSubmit={createPlaylist}><button type="button" className="modal-close" onClick={()=>setPlaylistModal(false)}>×</button><div className="eyebrow">MAKE IT YOURS</div><h2>Create a playlist</h2><label>Playlist name<input autoFocus maxLength={100} required placeholder="e.g. Binge-watch weekend" value={playlistTitle} onChange={e=>setPlaylistTitle(e.target.value)}/></label><label>Category / location<Dropdown label="Category / location" value={playlistDraftCategory} onChange={value=>setPlaylistDraftCategory(value as PlaylistCategory)} options={[...categories.map(category=>({value:category,label:category==='Shows'?'TV Shows':category==='Visual Novels'?'Visual Novel':category==='Web Novels'?'Web Novel':category})),{value:'Mixed',label:'Mixed / General'}]}/></label><label>Description <span className="optional-label">OPTIONAL</span><textarea rows={3} maxLength={280} placeholder="What belongs in this collection?" value={playlistDescription} onChange={e=>setPlaylistDescription(e.target.value)}/></label><label>Cover image <span className="optional-label">OPTIONAL · MAX 2 MB</span><input type="file" accept="image/*" onChange={uploadPlaylistCover}/></label>{playlistCover&&<MediaImage className="cover-preview" src={playlistCover} sizes="200px" alt="Playlist cover preview"/>}<div className="modal-actions"><button type="button" className="cancel-btn" onClick={()=>setPlaylistModal(false)}>Cancel</button><button className="create-playlist-btn" type="submit">Create playlist</button></div></form></div>}
        {themePanelOpen&&<div className="modal-scrim theme-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setThemePanelOpen(false)}}><section className="theme-panel" role="dialog" aria-modal="true" aria-label="Appearance settings"><button className="modal-close" aria-label="Close appearance settings" onClick={()=>setThemePanelOpen(false)}>×</button><div className="eyebrow">MAKE IT YOURS</div><h2>Appearance settings<span>.</span></h2><p className="theme-intro">Tune the atmosphere. Changes preview as soon as you make them.</p><div className="theme-group"><h3>Background artwork</h3><div className="theme-upload-row"><label className="theme-upload">＋ Upload image<input type="file" accept="image/*" onChange={uploadThemeBackground}/></label><input value={themeUrlDraft} onChange={event=>setThemeUrlDraft(event.target.value)} placeholder="Paste an image URL…" aria-label="Background image URL"/><button onClick={()=>setTheme(current=>({...current,background:themeUrlDraft.trim()}))}>Apply</button></div><div className="theme-slider"><label htmlFor="theme-opacity">Artwork visibility <b>{theme.opacity}%</b></label><input id="theme-opacity" type="range" min="0" max="100" value={theme.opacity} onChange={event=>setTheme(current=>({...current,opacity:Number(event.target.value)}))}/></div><div className="theme-slider"><label htmlFor="theme-blur">Background blur <b>{theme.blur}px</b></label><input id="theme-blur" type="range" min="0" max="20" value={theme.blur} onChange={event=>setTheme(current=>({...current,blur:Number(event.target.value)}))}/></div><div className="theme-inline-label">Image fit</div><div className="theme-segments">{(['cover','center','stretch'] as const).map(option=><button key={option} className={theme.fit===option?'active':''} onClick={()=>setTheme(current=>({...current,fit:option}))}>{option}</button>)}</div>{theme.background&&<button className="theme-clear" onClick={()=>{setTheme(current=>({...current,background:''}));setThemeUrlDraft('')}}>Remove background image</button>}</div><div className="theme-group"><h3>Background tone</h3><div className="theme-tones">{tones.map(tone=><button key={tone.value} className={theme.tone===tone.value?'selected':''} onClick={()=>setTheme(current=>({...current,tone:tone.value}))}><i style={{background:tone.value}}/>{tone.name}</button>)}</div></div><div className="theme-group"><h3>Accent color</h3><div className="accent-swatches">{accents.map(accent=><button key={accent.value} className={theme.accent.toLowerCase()===accent.value?'selected':''} title={accent.name} aria-label={accent.name} style={{'--swatch':accent.value} as React.CSSProperties} onClick={()=>setTheme(current=>({...current,accent:accent.value}))}/>) }<label className="custom-color">Custom<input type="color" value={theme.accent} aria-label="Custom accent color" onChange={event=>setTheme(current=>({...current,accent:event.target.value}))}/></label></div></div><div className="theme-footer"><button className="theme-reset" onClick={()=>{setTheme(defaultTheme);setThemeUrlDraft('')}}>Reset to default</button><button className="create-playlist-btn" onClick={()=>setThemePanelOpen(false)}>Done</button></div></section></div>}
        {playlistToDelete&&<div className="modal-scrim playlist-delete-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setPlaylistToDelete(null)}}><section className="playlist-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-playlist-title" aria-describedby="delete-playlist-description"><button type="button" className="modal-close" aria-label="Cancel delete" onClick={()=>setPlaylistToDelete(null)}>×</button><div className="playlist-delete-icon"><Trash2 size={20}/></div><div className="eyebrow">REMOVE COLLECTION</div><h2 id="delete-playlist-title">Delete playlist?</h2><p id="delete-playlist-description">Are you sure you want to delete “{playlistToDelete.title}”? Its playlist entries will be removed, while the titles remain in your library.</p><div className="playlist-delete-actions"><button type="button" className="cancel-btn" onClick={()=>setPlaylistToDelete(null)}>Cancel</button><button type="button" className="playlist-delete-confirm" onClick={()=>deletePlaylist(playlistToDelete.id)}><Trash2 size={14}/> Delete playlist</button></div></section></div>}
        {authMode&&<div className="modal-scrim auth-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setAuthMode(null)}}><form className="auth-dialog" onSubmit={submitAuth} role="dialog" aria-modal="true" aria-label={authMode==='signup'?'Create account':'Log in'}><button type="button" className="modal-close" aria-label="Close" onClick={()=>setAuthMode(null)}>×</button><div className="eyebrow">YOUR LIBRARY, ON EVERY DEVICE</div><h2>{authMode==='signup'?'Create your account':'Welcome back'}<em>.</em></h2><p>{authMode==='signup'?'Your lists, ratings, progress, playlists, and theme will sync securely.':'Log in to load your private synced media library.'}</p><label>Username<input autoFocus autoComplete="username" maxLength={24} value={authUsername} onChange={event=>setAuthUsername(event.target.value)} placeholder="username123"/></label><label>Password<input type="password" autoComplete={authMode==='signup'?'new-password':'current-password'} value={authPassword} onChange={event=>setAuthPassword(event.target.value)} placeholder="At least 8 characters"/></label>{authMode==='signup'&&<label>Confirm password<input type="password" autoComplete="new-password" value={authConfirm} onChange={event=>setAuthConfirm(event.target.value)} placeholder="Type the password again"/></label>}{authError&&<div className="auth-error" role="alert">{authError}</div>}<button className="auth-submit" disabled={authBusy}>{authBusy?'Please wait…':authMode==='signup'?'Create account':'Log in'}</button><button type="button" className="auth-switch" onClick={()=>{setAuthMode(authMode==='signup'?'login':'signup');setAuthError('')}}>{authMode==='signup'?'Already have an account? Log in':'New here? Create an account'}</button><small className="auth-footnote">Username and password only. Password recovery is not available without an email address.</small></form></div>}
        {toastMessage&&<div className="toast-message" role="status">✓ &nbsp; {toastMessage}</div>}
        <footer className="footer"><span>✳</span> Gatari <i>·</i> your personal media log <span className="footer-right">{authUser?'Synced to your account':supabaseConfigured?'Saved in this browser':'Guest · saved in this browser'}</span></footer>
      </div>
    </section>
  </main>;
}
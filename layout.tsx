import type { Metadata } from 'next';
import './globals.css';

const themeBootstrapScript = `(()=>{try{const raw=localStorage.getItem('theme')||localStorage.getItem('sidequest-theme');if(!raw)return;const root=document.documentElement;let saved;try{saved=JSON.parse(raw)}catch{saved=raw}if(typeof saved==='string'){root.setAttribute('data-theme',saved);root.classList.add(saved);return}if(!saved||typeof saved!=='object')return;const theme=saved;const tone=theme.tone||'#090b10';const accent=theme.accent||'#d3f36b';root.setAttribute('data-theme','custom');root.classList.add('custom');root.style.setProperty('--bg',tone);root.style.setProperty('--theme-base',tone);root.style.setProperty('--theme-accent',accent);root.style.setProperty('--lime',accent);const background=String(theme.background||'').trim();root.style.setProperty('--theme-background',background?'url('+JSON.stringify(background)+')':'none');root.style.setProperty('--theme-opacity',String(Number(theme.opacity??20)/100));root.style.setProperty('--theme-blur',String(Number(theme.blur??0))+'px');const fit=theme.fit;root.style.setProperty('--theme-fit',fit==='stretch'?'100% 100%':fit==='center'?'auto':'cover')}catch{}})();`;

export const metadata: Metadata = {
  title: 'Gatari — Personal media tracker',
  description: 'Your personal space to track what you watch and read.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/apple-icon.png'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} /></head><body>{children}</body></html>;
}

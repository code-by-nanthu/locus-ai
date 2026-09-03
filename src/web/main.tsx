import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// S-1: Extract bearer token from URL query params and persist in sessionStorage and localStorage
const searchParams = new URLSearchParams(window.location.search);
const tokenFromUrl = searchParams.get('token');
if (tokenFromUrl) {
  sessionStorage.setItem('locus_token', tokenFromUrl);
  localStorage.setItem('locus_token', tokenFromUrl);
  searchParams.delete('token');
  const newSearch = searchParams.toString();
  const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
  window.history.replaceState({}, '', cleanUrl);
}

// Automatically attach Bearer token to all loopback API fetch calls
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith('/api') || url.includes('/api/')) {
    const token = sessionStorage.getItem('locus_token') || localStorage.getItem('locus_token');
    if (token) {
      init = init || {};
      const headers = new Headers(init.headers || {});
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      init.headers = headers;
    }
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

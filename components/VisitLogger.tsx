'use client';

import { useEffect } from 'react';

// Logib ühe külastuse sessiooni kohta (mitte iga lehevaate kohta).
export default function VisitLogger() {
  useEffect(() => {
    let already = false;
    try {
      already = !!sessionStorage.getItem('rb_visit_logged');
      if (!already) sessionStorage.setItem('rb_visit_logged', '1');
    } catch { /* sessionStorage võib puududa */ }
    if (already) return;
    fetch('/api/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: window.location.pathname }),
      keepalive: true
    }).catch(() => {});
  }, []);
  return null;
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/lib/auth';
import ImageUpload from '@/components/ImageUpload';

const IMG_FIELDS = [
  ['cover_front_url', 'Esikaas'],
  ['cover_spine_url', 'Selg'],
  ['cover_back_url', 'Tagakaas'],
  ['title_page_url', 'Tiitelleht']
] as const;

type BookImgs = {
  id: string;
  cover_front_url: string | null;
  cover_spine_url: string | null;
  cover_back_url: string | null;
  title_page_url: string | null;
};

export default function BookActions({ book }: { book: BookImgs }) {
  const { role, isEditor, loading, login } = useRole();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'none' | 'images'>('none');

  if (loading) return null;

  const missing = IMG_FIELDS.filter(([f]) => !book[f]);

  // Anonüümne: vihje sisselogimiseks (ainult kui pilte puudu)
  if (role === 'anon') {
    if (!missing.length) return null;
    return (
      <p className="muted small ba-hint">
        Puuduvaid kaanepilte saab lisada sisse logides.{' '}
        <button className="linklike" onClick={login}>Logi sisse Google&apos;iga</button>
      </p>
    );
  }

  // Tavakasutaja: ainult puuduvate piltide üleslaadimine
  if (!isEditor) {
    if (!missing.length) return null;
    return (
      <div className="ba-userup">
        <h3>Lisa puuduv kaanepilt</h3>
        <p className="muted small">Sa saad lisada pilte väljadele, millel neid veel pole. Max 1 MB; suurus vähendatakse automaatselt.</p>
        <div className="imgup-grid">
          {missing.map(([f, label]) => (
            <ImageUpload key={f} bookId={book.id} field={f} label={label} currentUrl={null} />
          ))}
        </div>
      </div>
    );
  }

  // Toimetaja / superadmin: "..." menüü
  return (
    <div className="ba">
      <button className="ba-dots" onClick={() => setOpen(o => !o)} aria-label="Tegevused">⋯</button>
      {open && (
        <div className="ba-menu" onMouseLeave={() => setOpen(false)}>
          <Link href={`/toimeta/${book.id}`} className="ba-item">Muuda kirjet</Link>
          <button className="ba-item" onClick={() => { setPanel(p => p === 'images' ? 'none' : 'images'); }}>
            Halda kaanepilte
          </button>
        </div>
      )}
      {panel === 'images' && (
        <div className="ba-userup">
          <div className="imgup-grid">
            {IMG_FIELDS.map(([f, label]) => (
              <ImageUpload key={f} bookId={book.id} field={f} label={label} currentUrl={book[f]} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

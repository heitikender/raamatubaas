import Link from 'next/link';
import type { Book } from '@/lib/types';

export default function BookCard({ book }: { book: Book }) {
  return (
    <Link href={`/raamat/${book.id}`} className="bookcard">
      <div className="coverbox">
        {book.cover_front_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.cover_front_url} alt={`„${book.title}” esikaas`} loading="lazy" />
        ) : (
          <span className="nocover">kaanepilt<br />puudub</span>
        )}
      </div>
      <span className="t">{book.title}</span>
      <span className="a">{book.authors.join(', ')}</span>
      <span className="y">{book.pub_year ?? ''}</span>
    </Link>
  );
}

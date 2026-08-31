export type Series = {
  id: string;
  name: string;
  publisher: string | null;
  description: string | null;
};

export type Book = {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn: string | null;
  orig_language: string | null;
  language: string;
  publisher: string | null;
  print_run: number | null;
  orig_year: number | null;
  pub_year: number | null;
  series_id: string | null;
  series_position: number | null;
  cover_front_url: string | null;
  cover_spine_url: string | null;
  cover_back_url: string | null;
  title_page_url: string | null;
  description: string | null;
  genre: string | null;
  translators: string[];
  notes: string | null;
  slug: string | null;
  series?: Series | null;
};

export type Source = {
  id: string;
  name: string;
  kind: string;
  base_url: string | null;
  api_notes: string | null;
};

export type BookSource = {
  id: string;
  book_id: string;
  source_id: string;
  url: string | null;
  raw: unknown;
  fetched_at: string;
  sources?: Source | null;
};

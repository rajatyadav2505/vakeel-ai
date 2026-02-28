import { createClient } from '@supabase/supabase-js';

interface KanoonDoc {
  tid: string;
  title: string;
  headline?: string;
}

async function fetchKanoonDocs(query: string, token: string): Promise<KanoonDoc[]> {
  const response = await fetch(
    `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(query)}&pagenum=0`,
    {
      headers: { Authorization: `Token ${token}` },
    }
  );
  if (!response.ok) return [];
  const json = (await response.json()) as { docs?: KanoonDoc[] };
  return json.docs ?? [];
}

export async function seedKanoonRag(params: {
  supabaseUrl: string;
  serviceRoleKey: string;
  kanoonToken: string;
}) {
  const supabase = createClient(params.supabaseUrl, params.serviceRoleKey);
  const queries = ['article 21 bail', 'interim injunction order 39', 'consumer deficiency service'];

  for (const query of queries) {
    const docs = await fetchKanoonDocs(query, params.kanoonToken);
    for (const doc of docs.slice(0, 10)) {
      await supabase.from('legal_corpus').upsert({
        id: `kanoon-${doc.tid}`,
        source: 'indiankanoon',
        title: doc.title,
        content: doc.headline ?? doc.title,
        citation_url: `https://indiankanoon.org/doc/${doc.tid}/`,
      });
    }
  }
}

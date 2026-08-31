import { serverClient } from '@/lib/supabase';

export const revalidate = 300;

export default async function SourcesPage() {
  const sb = serverClient();
  const { data: sources } = await sb.from('sources').select('*').order('kind').order('name');

  return (
    <>
      <h1>Allikad</h1>
      <p className="muted">
        Raamatupoed, antikvariaadid, bibliograafiad ja wikid, kust korjeagent raamatute andmeid kogub.
        Iga raamatu juures on kirjas, millisest allikast info pärineb.
      </p>
      <div className="tablewrap">
        <table>
          <thead><tr><th>Allikas</th><th>Liik</th><th>Märkused masinloetavuse kohta</th></tr></thead>
          <tbody>
            {(sources ?? []).map(s => (
              <tr key={s.id}>
                <td>{s.base_url ? <a href={s.base_url} target="_blank" rel="noreferrer"><b>{s.name}</b></a> : <b>{s.name}</b>}</td>
                <td>{s.kind}</td>
                <td className="small muted">{s.api_notes ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

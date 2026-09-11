import { supabase } from "../lib/supabase";

export default async function Home() {
  const { data: seasons, error } = await supabase
    .from("seasons")
    .select("year, championship_score")
    .order("year", { ascending: false });

  if (error) {
    return (
      <main style={{ padding: "40px" }}>
        <h1>Dirty P Fantasy Football</h1>
        <p>Database error: {error.message}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "40px" }}>
      <h1>Dirty P Fantasy Football</h1>
      <p>League history from 2014–2025.</p>

      <h2>Seasons Loaded: {seasons.length}</h2>

      {seasons.map((season) => (
        <div key={season.year}>
          {season.year} — Championship: {season.championship_score}
        </div>
      ))}
    </main>
  );
}



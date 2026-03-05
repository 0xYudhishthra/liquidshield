const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function fetchPositions(address: string) {
  const res = await fetch(`${API_BASE}/positions/${address}`);
  if (!res.ok) throw new Error("Failed to fetch positions");
  return res.json();
}

export async function fetchDefenseHistory(address: string) {
  const res = await fetch(`${API_BASE}/defenses/${address}`);
  if (!res.ok) throw new Error("Failed to fetch defense history");
  return res.json();
}

export async function fetchLPEarnings(address: string) {
  const res = await fetch(`${API_BASE}/lp/${address}/earnings`);
  if (!res.ok) throw new Error("Failed to fetch LP earnings");
  return res.json();
}

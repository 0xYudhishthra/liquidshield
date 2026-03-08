"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchDefenseHistory } from "@/lib/api";
export function useDefenseHistory(address: string | undefined) {
  return useQuery({ queryKey: ["defenseHistory", address], queryFn: () => fetchDefenseHistory(address!), enabled: !!address });
}

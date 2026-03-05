"use client";
import { useQuery } from "@tanstack/react-query";
import { fetchPositions } from "@/lib/api";
export function usePositions(address: string | undefined) {
  return useQuery({ queryKey: ["positions", address], queryFn: () => fetchPositions(address!), enabled: !!address, refetchInterval: 30_000 });
}

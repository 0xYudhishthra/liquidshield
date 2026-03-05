"use client";
import { useQuery } from "@tanstack/react-query";
export function useHealthFactor(positionId: string | undefined) {
  return useQuery({ queryKey: ["healthFactor", positionId], queryFn: async () => ({ healthFactor: 0 }), enabled: !!positionId, refetchInterval: 10_000 });
}

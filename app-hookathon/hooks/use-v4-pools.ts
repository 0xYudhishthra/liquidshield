import { useQuery } from '@tanstack/react-query'
import { fetchV4Pools } from '@/lib/v4-api'

export function useV4Pools(chainId: number | undefined) {
    return useQuery({
        queryKey: ['v4-pools', chainId],
        queryFn: () => fetchV4Pools(chainId!),
        enabled: !!chainId,
        refetchInterval: 15000,
    })
}

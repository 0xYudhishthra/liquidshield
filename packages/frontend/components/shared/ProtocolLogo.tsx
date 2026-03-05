import { SUPPORTED_PROTOCOLS } from "@/lib/chains";
export function ProtocolLogo({ protocol }: { protocol: keyof typeof SUPPORTED_PROTOCOLS }) {
  const proto = SUPPORTED_PROTOCOLS[protocol];
  if (!proto) return null;
  return <span className="inline-flex items-center gap-1 text-sm text-gray-300">{proto.name}</span>;
}

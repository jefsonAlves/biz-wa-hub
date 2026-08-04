import { MessageSquare } from "lucide-react";

export const DsaLogo = ({ className, size = 32 }: { className?: string; size?: number }) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Simplified representation of the DSA stylized S lightning bolt ribbon */}
        <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="gradient-bolt" x1="0" y1="0" x2="100" y2="100">
              <stop offset="0%" stopColor="#00B3FF" />
              <stop offset="100%" stopColor="#0B66E4" />
            </linearGradient>
          </defs>
          <path d="M75 10L25 50L75 90L75 60L45 50L75 40L75 10Z" fill="url(#gradient-bolt)" />
        </svg>
      </div>
      <span className="font-bold text-xl tracking-tight text-white">DSA</span>
    </div>
  );
};

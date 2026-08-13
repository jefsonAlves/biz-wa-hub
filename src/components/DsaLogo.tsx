import logoAsset from "@/assets/logo.png.asset.json";

interface DsaLogoProps {
  className?: string;
  size?: number;
}

export const DsaLogo = ({ className = "", size = 32 }: DsaLogoProps) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img 
        src={logoAsset.url} 
        alt="Chat Zap Flow Logo" 
        style={{ height: size, width: 'auto', maxWidth: '100%' }}
        className="object-contain"
      />
    </div>
  );
};

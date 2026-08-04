import logoAsset from "@/assets/dsa-logo.png.asset.json";

interface DsaLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const DsaLogo = ({ className = "", size = 32, showText = true }: DsaLogoProps) => {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img 
        src={logoAsset.url} 
        alt="DSA Logo" 
        style={{ height: size, width: 'auto', maxWidth: '100%' }}
        className="object-contain"
      />
    </div>
  );
};

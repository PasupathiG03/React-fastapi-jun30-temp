interface PulseLogoProps {
  collapsed?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

// The logo image is used as a mask, so it is painted in the template's cyan → blue gradient.
const LOGO_URL = "url(/assets/logo.png)";
const LOGO_ASPECT = 575 / 214;
// Icon-only mark shown when the sidebar is collapsed.
const ICON_URL = "url(/assets/m-favicon-white.png)";
const ICON_ASPECT = 340 / 214;

export default function PulseLogo({ collapsed = false, className = "", size = "md" }: PulseLogoProps) {
  const height = size === "lg" ? 48 : size === "sm" ? 32 : 44;
  const iconHeight = size === "lg" ? 34 : size === "sm" ? 24 : 30;
  const maskUrl = collapsed ? ICON_URL : LOGO_URL;

  return (
    <div className={`flex w-full items-center justify-center select-none ${className}`}>
      <div
        role="img"
        aria-label="PULSE"
        className="bg-gradient-to-r from-[#00b4db] via-[#0084ff] to-[#0072ff] shrink-0 mx-auto"
        style={{
          height: collapsed ? iconHeight : height,
          width: collapsed ? iconHeight * ICON_ASPECT : height * LOGO_ASPECT,
          WebkitMaskImage: maskUrl,
          maskImage: maskUrl,
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    </div>
  );
}

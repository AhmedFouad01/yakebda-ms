import { ImgHTMLAttributes, useEffect, useState } from "react";
import { brand } from "../../config/brand";

interface BrandLogoProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
}

export function BrandLogo({ src, onError, ...props }: BrandLogoProps) {
  const [currentSrc, setCurrentSrc] = useState(src || brand.logoPath);

  useEffect(() => {
    setCurrentSrc(src || brand.logoPath);
  }, [src]);

  return (
    <img
      {...props}
      src={currentSrc}
      onError={(event) => {
        if (currentSrc !== brand.logoPath) setCurrentSrc(brand.logoPath);
        onError?.(event);
      }}
    />
  );
}

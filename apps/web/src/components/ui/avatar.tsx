import * as React from "react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Avatar root                                                               */
/* -------------------------------------------------------------------------- */

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Width / height in Tailwind size classes. Defaults to "h-10 w-10". */
  size?: string;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  ({ className, size = "h-10 w-10", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "relative flex shrink-0 overflow-hidden rounded-full",
        size,
        className
      )}
      {...props}
    />
  )
);
Avatar.displayName = "Avatar";

/* -------------------------------------------------------------------------- */
/*  Avatar image                                                              */
/* -------------------------------------------------------------------------- */

export interface AvatarImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, alt = "", ...props }, ref) => {
    const [hasError, setHasError] = React.useState(false);

    // Reset error state when src changes
    React.useEffect(() => {
      setHasError(false);
    }, [props.src]);

    if (hasError || !props.src) {
      return null;
    }

    return (
      <img
        ref={ref}
        className={cn("aspect-square h-full w-full object-cover", className)}
        alt={alt}
        onError={() => setHasError(true)}
        {...props}
      />
    );
  }
);
AvatarImage.displayName = "AvatarImage";

/* -------------------------------------------------------------------------- */
/*  Avatar fallback (initials or icon)                                        */
/* -------------------------------------------------------------------------- */

export interface AvatarFallbackProps
  extends React.HTMLAttributes<HTMLSpanElement> {}

const AvatarFallback = React.forwardRef<HTMLSpanElement, AvatarFallbackProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium select-none",
        className
      )}
      role="img"
      aria-label={
        typeof props.children === "string" ? props.children : undefined
      }
      {...props}
    />
  )
);
AvatarFallback.displayName = "AvatarFallback";

export { Avatar, AvatarImage, AvatarFallback };

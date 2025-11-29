import { cn } from "./utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-md", className)}
      style={{
        backgroundColor: '#B8BCBC',
        animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        display: 'block',
        minHeight: '1rem',
        minWidth: '1rem',
      }}
      {...props}
    />
  );
}

export { Skeleton };

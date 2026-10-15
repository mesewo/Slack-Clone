export function AppLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex h-full min-h-[24rem] flex-1 flex-col items-center justify-center gap-5"
    >
      <div className="grid grid-cols-2 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="size-4 animate-bounce rounded-md bg-purple-500"
            style={{ animationDelay: `${i * 120}ms`, opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
      <div className="h-1 w-28 overflow-hidden rounded-full bg-purple-500/20">
        <div className="h-full w-1/2 animate-[loader-slide_1.1s_ease-in-out_infinite] rounded-full bg-purple-500" />
      </div>
    </div>
  );
}

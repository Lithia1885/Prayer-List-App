import { useEffect, useState } from "react";

const SIZES = ["normal", "large", "xl"] as const;
type Size = typeof SIZES[number];

const ARIA_LABELS: Record<Size, string> = {
  normal: "Default text size",
  large: "Large text",
  xl: "Largest text",
};

const readSaved = (): Size => {
  try {
    const v = localStorage.getItem("textSize");
    return v === "large" || v === "xl" ? v : "normal";
  } catch {
    return "normal";
  }
};

export const TextSizeControl = () => {
  const [size, setSize] = useState<Size>(readSaved);

  useEffect(() => {
    if (size === "normal") delete document.documentElement.dataset.textSize;
    else document.documentElement.dataset.textSize = size;
    try {
      localStorage.setItem("textSize", size);
    } catch {
      /* storage disabled — control still works for the session */
    }
  }, [size]);

  return (
    <div role="group" aria-label="Text size" className="inline-flex items-center gap-1 shrink-0">
      {SIZES.map((s, i) => (
        <button
          key={s}
          type="button"
          onClick={() => setSize(s)}
          aria-label={ARIA_LABELS[s]}
          aria-pressed={s === size}
          className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md font-semibold transition-colors ${
            s === size
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-surface-sunken"
          }`}
          // Force the visual scaling of the "A" character regardless of the
          // currently-active text-size on <html> — the button's job is to LOOK
          // like a small/medium/large A, even if your overall text is already xl.
          style={{ fontSize: `${0.85 + i * 0.2}rem` }}
        >
          A
        </button>
      ))}
    </div>
  );
};

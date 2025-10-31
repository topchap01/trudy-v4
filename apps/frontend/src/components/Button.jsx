export default function Button({
  children,
  onClick,
  loading = false,
  disabled = false,
  variant = "solid", // "solid" | "outline"
  type = "button",
  className = "",
}) {
  const base =
    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition border";
  const look =
    variant === "outline"
      ? "bg-white text-gray-800 border-gray-300 hover:bg-gray-50"
      : "bg-sky-600 text-white border-sky-600 hover:bg-sky-700";
  const state = loading || disabled ? "opacity-60 cursor-not-allowed" : "";
  return (
    <button
      type={type}
      onClick={loading || disabled ? undefined : onClick}
      disabled={loading || disabled}
      className={`${base} ${look} ${state} ${className}`}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin border-2 border-white/70 border-t-transparent rounded-full" />
      ) : null}
      {children}
    </button>
  );
}

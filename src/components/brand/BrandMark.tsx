import Link from "next/link";

export function BrandMark() {
  return (
    <Link className="brand-mark" href="/" aria-label="Still With home">
      <span className="brand-mark-primary">Still</span>
      <span className="brand-mark-secondary">With</span>
    </Link>
  );
}

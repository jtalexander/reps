"use client";

/** Opens the browser's print dialog (save as PDF from there too). */
export function PrintButton() {
  return (
    <button className="btn btn-primary ml-auto min-h-9 px-4 text-sm" onClick={() => window.print()}>
      Print
    </button>
  );
}

type SearchKeyword = {
  label: string;
  description: string;
};

const DEFAULT_KEYWORDS: SearchKeyword[] = [
  { label: "category:...", description: "Filter by category" },
  { label: "price:...", description: "Filter by price" },
  { label: "mode:...", description: "Filter by payment mode" },
  { label: "family:...", description: "Filter by family member" },
  { label: "date:...", description: "Filter by date" },
  { label: "payee:...", description: "Filter by payee" },
  { label: "type:...", description: "Filter by debit or credit" },
  { label: "+category:...", description: "Include category" },
  { label: "-food", description: "Exclude food" },
  { label: "food; +debit", description: "Combine rules" },
];

export default function SearchKeywordsPanel({ open = false, keywords = DEFAULT_KEYWORDS }: { open?: boolean; keywords?: SearchKeyword[] }) {
  if (!open) return null;

  return (
    <div className="search-keywords-panel" aria-live="polite">
      {keywords.map((keyword) => (
        <div key={`${keyword.label}-${keyword.description}`} className="search-keyword-row">
          <span className="search-keyword-label">{keyword.label}</span>
          <span className="search-keyword-desc">{keyword.description}</span>
        </div>
      ))}
    </div>
  );
}

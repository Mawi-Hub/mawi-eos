import Link from "next/link";

interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint?: string;
  link?: { href: string; label: string };
}

interface Props {
  userName: string;
  items: ChecklistItem[];
}

export function PreReadChecklist({ userName, items }: Props) {
  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const complete = doneCount === total;

  return (
    <section className={`rounded-lg border ${complete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"} px-5 py-4`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tu pre-read</div>
          <div className="mt-0.5 text-sm font-medium text-gray-900">
            {userName} · {doneCount}/{total} completo
          </div>
        </div>
        {complete && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            Listo ✓
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                item.done ? "bg-emerald-500 text-white" : "bg-gray-300 text-white"
              }`}
            >
              {item.done ? "✓" : "•"}
            </span>
            <span className={item.done ? "text-gray-500 line-through" : "text-gray-800"}>
              {item.label}
            </span>
            {item.hint && !item.done && (
              <span className="text-xs text-gray-500">— {item.hint}</span>
            )}
            {item.link && !item.done && (
              <Link href={item.link.href} className="text-xs font-medium text-mawi-700 hover:underline">
                {item.link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

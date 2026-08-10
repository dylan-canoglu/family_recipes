import { CheckCircle2 } from 'lucide-react';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-slate-900 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm font-medium">
      <CheckCircle2 className="w-4 h-4 text-green-400" />
      {message}
    </div>
  );
}

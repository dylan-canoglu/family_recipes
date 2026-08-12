import { AlertTriangle } from 'lucide-react';

// Shown instead of the app when the Supabase credentials never made it into
// the build. Written to be readable on a phone by someone who is not looking
// at a terminal, because that is exactly when it appears.
export function ConfigError({ missing }: { missing: string[] }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white max-w-lg w-full rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex items-center gap-3 mb-4 text-amber-600">
          <AlertTriangle className="w-8 h-8 flex-shrink-0" />
          <h1 className="text-xl font-bold text-slate-900">The vault isn’t connected</h1>
        </div>

        <p className="text-slate-600 mb-5">
          This build went out without its database credentials, so it can’t load recipes or sign
          anyone in. The recipes themselves are safe — only this deployment is misconfigured.
        </p>

        <p className="text-sm font-semibold text-slate-700 mb-2">Missing:</p>
        <ul className="mb-5 space-y-1">
          {missing.map((name) => (
            <li key={name} className="font-mono text-sm bg-slate-100 text-slate-800 px-3 py-2 rounded-lg">
              {name}
            </li>
          ))}
        </ul>

        <p className="text-sm text-slate-600">
          Add them under <span className="font-semibold">Site configuration → Environment variables</span>{' '}
          in Netlify, then redeploy from <span className="font-semibold">Deploys → Trigger deploy</span>.
          Values baked in at build time, so changing them needs a fresh deploy to take effect.
        </p>
      </div>
    </div>
  );
}

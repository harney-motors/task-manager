export default function App() {
  return (
    <div className="min-h-screen bg-bg text-text font-sans">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-info text-white flex items-center justify-center">
            <i className="ti ti-checkbox text-base" />
          </div>
          <span className="text-lg font-medium tracking-tight">Loop</span>
        </div>

        <h1 className="text-2xl font-medium tracking-tight mb-2">
          Hello, Loop.
        </h1>
        <p className="text-text-2 text-sm mb-8">
          Chunk 1 — foundation. If you can see this with the right fonts,
          colors, and the checkbox icon above, scaffolding worked.
        </p>

        <div className="bg-surface border border-border rounded-xl p-5">
          <div className="text-sm font-medium mb-3">Color sanity check</div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-pic-purple-bg text-pic-purple-text">
              Asbert
            </span>
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-pic-coral-bg text-pic-coral-text">
              Clem
            </span>
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-pic-pink-bg text-pic-pink-text">
              Stephen
            </span>
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-pic-green-bg text-pic-green-text">
              Richard
            </span>
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-pic-amber-bg text-pic-amber-text">
              Charlene
            </span>
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-pic-teal-bg text-pic-teal-text">
              Leslie
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

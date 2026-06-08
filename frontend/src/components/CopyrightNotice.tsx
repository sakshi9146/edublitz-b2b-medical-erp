import clsx from 'clsx'

export function CopyrightNotice({ className }: { className?: string }) {
  const year = new Date().getFullYear()
  return (
    <div
      className={clsx(
        'text-center text-xs leading-relaxed',
        className
      )}
    >
      <p>Edublitz — Powered by Greamio Technologies Pvt Ltd</p>
      <p className="mt-0.5 opacity-90">
        Copyright © {year} Greamio Technologies Pvt Ltd. All rights reserved.
      </p>
    </div>
  )
}

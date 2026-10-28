import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** One line about the data: the finding, the scope or the period. */
  sub?: ReactNode;
  /** Real actions only. */
  actions?: ReactNode;
}

export default function PageHeader({ title, sub, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

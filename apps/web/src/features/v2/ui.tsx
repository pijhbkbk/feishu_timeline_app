import Link from 'next/link';
import React from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import { ChevronRightIcon } from './icons';

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="r26-page-intro">
      <div>
        {eyebrow ? <p className="r26-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="r26-page-intro__action">{action}</div> : null}
    </header>
  );
}

export function PrimaryLink({
  href,
  children,
  testId,
}: PropsWithChildren<{ href: string; testId?: string }>) {
  return (
    <Link href={href} className="r26-button r26-button--primary" data-testid={testId}>
      <span>{children}</span>
      <ChevronRightIcon />
    </Link>
  );
}

export function StatusPill({
  tone,
  children,
}: PropsWithChildren<{ tone: string }>) {
  return (
    <span className={`r26-status-pill r26-status-pill--${tone}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}

export function Fact({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="r26-fact">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

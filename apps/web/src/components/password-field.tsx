'use client';
import React, { useId, useState, type InputHTMLAttributes } from 'react';

export function PasswordField({ label, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return <div className="native-password-field">
    <label htmlFor={id}>{label}</label>
    <div className="native-password-input">
      <input {...props} id={id} type={visible ? 'text' : 'password'} />
      <button type="button" className="native-password-toggle" aria-label={`${visible ? '隐藏' : '显示'}${label}`} aria-pressed={visible} disabled={props.disabled} onClick={() => setVisible(value => !value)}>{visible ? '隐藏' : '显示'}</button>
    </div>
  </div>;
}

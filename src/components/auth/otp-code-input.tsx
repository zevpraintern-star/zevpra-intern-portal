"use client";

import { useEffect, useRef, useState } from "react";

interface OtpCodeInputProps {
  id: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void | Promise<void>;
  disabled?: boolean;
  autoFocus?: boolean;
  status?: string;
}

/** Accessible six-digit OTP field. One native input handles typing, paste and autofill. */
export function OtpCodeInput({ id, name = "code", value, onChange, onComplete, disabled = false, autoFocus = false, status }: OtpCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const completedValue = useRef("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (value.length < 6) completedValue.current = "";
  }, [value]);

  function update(raw: string) {
    const next = raw.replace(/\D/g, "").slice(0, 6);
    onChange(next);
    if (next.length === 6 && completedValue.current !== next) {
      completedValue.current = next;
      void onComplete(next);
    }
  }

  const complete = value.length === 6;

  return (
    <div>
      <div
        className="otp-tiles"
        data-complete={complete ? "true" : "false"}
        data-focused={focused ? "true" : "false"}
        role="group"
        aria-label="Six-digit verification code"
        onClick={() => inputRef.current?.focus()}
      >
        {Array.from({ length: 6 }, (_, index) => (
          <span className="otp-tile" data-active={focused && index === value.length && !complete ? "true" : "false"} key={index} aria-hidden="true">
            {value[index] ?? ""}
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          name={name}
          className="otp-tiles-input"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          required
          aria-label="One-Time Password, six digits"
          aria-describedby={`${id}-status`}
          onChange={(event) => update(event.currentTarget.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onClick={(event) => event.currentTarget.setSelectionRange(value.length, value.length)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "Home") {
              event.preventDefault();
              event.currentTarget.setSelectionRange(value.length, value.length);
            }
            if (event.key === "ArrowRight" || event.key === "End") {
              event.preventDefault();
              event.currentTarget.setSelectionRange(value.length, value.length);
            }
          }}
        />
      </div>
      <p id={`${id}-status`} className="otp-tiles-status" aria-live="polite" aria-atomic="true">
        {status ?? (complete ? "Code complete. Verifying automatically…" : "Enter the 6-digit code. It verifies automatically.")}
      </p>
    </div>
  );
}

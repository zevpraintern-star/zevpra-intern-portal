"use client";

import { Loader2 } from "lucide-react";
import { createContext, useActionState, useContext, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Alert } from "@/components/ui/alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { initialActionState, type ActionState } from "@/lib/api/action";
import { cn } from "@/lib/utils/cn";

const ErrorContext = createContext<Record<string, string>>({});

/** Shows the server-side validation message for one field and wires it to the input via aria. */
export function FieldError({ name }: { name: string }) {
  const errors = useContext(ErrorContext);
  const message = errors[name];
  if (!message) return null;
  return (
    <p id={`${name}-error`} role="alert" className="mt-1.5 text-sm text-destructive">
      {message}
    </p>
  );
}

export function useFieldErrors(): Record<string, string> {
  return useContext(ErrorContext);
}

export function SubmitButton({ children, pendingLabel, className, ...props }: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} className={className} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {pending ? pendingLabel ?? "Working…" : children}
    </Button>
  );
}

/**
 * Form bound to a server action. Renders the action's success/error message in an
 * announced alert and exposes per-field errors to <FieldError>.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <ErrorContext.Provider value={state.errors ?? {}}>
      <form
        action={async (formData) => {
          formAction(formData);
        }}
        key={resetOnSuccess && state.ok ? state.nonce : "form"}
        className={cn("space-y-5", className)}
        noValidate
      >
        {state.message ? (
          <Alert variant={state.ok ? "success" : "destructive"}>{state.message}</Alert>
        ) : null}
        {children}
      </form>
    </ErrorContext.Provider>
  );
}

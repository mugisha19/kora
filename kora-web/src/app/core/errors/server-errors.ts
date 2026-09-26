import { FieldTree, ValidationError } from '@angular/forms/signals';
import { ApiError } from '../api/api-error';

export type ServerValidationError = ValidationError.WithOptionalFieldTree & { kind: 'server' };

/**
 * Maps an API error's `errors[]` onto a Signal Forms tree, for returning from a `submit()` action:
 * each message lands on the field it names (`email`, `objectives[2].metric`). Errors for fields the
 * form doesn't have, and errors without field details, become form-level errors (no `fieldTree`).
 *
 * @param translate turns one field error into a sentence (see `ErrorMessages.fieldMessage`).
 */
export function serverErrors<T>(
  form: FieldTree<T>,
  error: ApiError,
  translate: (fieldError: ApiError['fieldErrors'][number]) => string,
  formMessage?: (error: ApiError) => string,
): ServerValidationError[] {
  if (error.fieldErrors.length === 0) {
    return formMessage ? [{ kind: 'server', message: formMessage(error) }] : [];
  }
  return error.fieldErrors.map((fieldError) => {
    const fieldTree = resolveField(form, fieldError.field);
    const message = translate(fieldError);
    return fieldTree ? { kind: 'server', message, fieldTree } : { kind: 'server', message };
  });
}

/** Walks `a.b[2].c` through the field tree; undefined when any segment doesn't exist. */
function resolveField(root: unknown, path: string): FieldTree<unknown> | undefined {
  const segments = path.match(/[^.[\]]+/g) ?? [];
  let node: unknown = root;
  for (const segment of segments) {
    if (node === null || (typeof node !== 'object' && typeof node !== 'function')) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node === root || typeof node !== 'function' ? undefined : (node as FieldTree<unknown>);
}

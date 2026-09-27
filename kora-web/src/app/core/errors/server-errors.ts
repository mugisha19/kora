import { FieldTree, ValidationError } from '@angular/forms/signals';
import { ApiError } from '../api/api-error';

export type ServerValidationError = ValidationError.WithOptionalFieldTree & { kind: 'server' };

/**
 * Maps an API error's `errors[]` onto a Signal Forms tree, for returning from a `submit()` action:
 * each message lands on the field it names (`email`, `objectives[2].metric`). Errors for fields the
 * form doesn't have, and errors without field details, become form-level errors (no `fieldTree`).
 * A nested field the form edits as one control (`budget.amount`) lands on that control (`budget`).
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

/**
 * Walks `a.b[2].c` through the field tree. When the form edits a nested value as one control (a
 * money input for `budget.amount`), the error lands on that control. Undefined when the path leads
 * nowhere visible: an unknown field, or a missing array item.
 */
function resolveField(root: unknown, path: string): FieldTree<unknown> | undefined {
  const segments = path.match(/[^.[\]]+/g) ?? [];
  let node: unknown = root;
  for (const [index, segment] of segments.entries()) {
    const next = (node as Record<string, unknown>)[segment];
    if (typeof next !== 'function' || next === root) {
      // Stop at a leaf control (its value isn't an object); anything else has no place to show it.
      const leaf = index > 0 && !isObject((node as FieldTree<unknown>)().value());
      return leaf ? (node as FieldTree<unknown>) : undefined;
    }
    node = next;
  }
  return node === root ? undefined : (node as FieldTree<unknown>);
}

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

// The transform guard's single mount (S4, D73, master §12.1). The modal is an
// interception, not an affordance: it belongs to the run path every runner
// calls, not to whichever component happened to raise it. Mounted once here,
// nowhere else — a second mount would reintroduce the per-surface duplication
// this phase removes.
import { useRunGuardStore } from '../stores/runGuard';
import { TransformGuardModal } from '../features/sql/TransformGuardModal';
import { materializeGuarded, modifyAnywayGuarded, cancelGuarded } from '../services/runPath';

export function TransformGuardHost() {
  const pending = useRunGuardStore((state) => state.pending);
  if (!pending?.mutationTarget) return null;

  return (
    <TransformGuardModal
      targetTable={pending.mutationTarget}
      onMaterialize={materializeGuarded}
      onModifyAnyway={modifyAnywayGuarded}
      onCancel={cancelGuarded}
    />
  );
}

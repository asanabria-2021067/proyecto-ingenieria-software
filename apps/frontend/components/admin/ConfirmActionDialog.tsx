'use client';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  variant?: 'destructive' | 'warning' | 'default';
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const actionClasses: Record<string, string> = {
  destructive:
    'bg-error text-on-error hover:bg-error/90 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
  warning:
    'bg-amber-600 text-white hover:bg-amber-700 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
  default:
    'bg-primary text-on-primary hover:bg-primary/90 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
};

export function ConfirmActionDialog({
  open,
  title,
  description,
  actionLabel,
  variant = 'default',
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <AlertDialogContent className="bg-surface-container-lowest border-outline-variant rounded-xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-on-surface">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-tertiary">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={onCancel}
            className="rounded-xl border-outline-variant text-on-surface hover:bg-surface-container-high"
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className={actionClasses[variant]}
          >
            {isPending ? 'Procesando…' : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

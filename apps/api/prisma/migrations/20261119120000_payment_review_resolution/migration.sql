-- A receipt held for review (crediting it would exceed the balance cap) is
-- resolved by an administrator: credited later, or refunded outside the panel.
ALTER TYPE "PaymentStatus" ADD VALUE 'refunded';

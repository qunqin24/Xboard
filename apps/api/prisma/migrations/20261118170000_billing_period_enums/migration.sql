ALTER TYPE "BillingPeriod" ADD VALUE 'half_yearly' BEFORE 'yearly';
ALTER TYPE "BillingPeriod" ADD VALUE 'two_yearly';
ALTER TYPE "BillingPeriod" ADD VALUE 'three_yearly';
ALTER TYPE "BillingPeriod" ADD VALUE 'onetime';
ALTER TYPE "TrafficResetMode" ADD VALUE 'year_start';
ALTER TYPE "TrafficResetMode" ADD VALUE 'activation_anniversary';

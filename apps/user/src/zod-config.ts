import { z } from "zod";

// Run before routes construct schemas. Production forbids dynamic code evaluation.
z.config({ jitless: true });

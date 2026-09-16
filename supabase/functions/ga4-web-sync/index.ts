// Keep the Deno entrypoint small so the complete handler can run in Vitest.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler((name) => Deno.env.get(name)));

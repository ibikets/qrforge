import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Service-role client for management code. Loosely typed because the portal tables are not in generated types. */
export const adm = () => supabaseAdmin() as unknown as SupabaseClient<any, any, any>;
